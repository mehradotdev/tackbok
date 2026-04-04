import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Play, Pause, X } from 'lucide-react-native';
import { useNavigation } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { audioEngine, type PlaybackState } from '~/lib/audioEngine';
import { getFullVoiceMemoUri } from '~/lib/voiceMemoUtils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { WaveformVisualizer } from '~/components/WaveformVisualizer';

// ============================================================================
// Types
// ============================================================================

interface AudioPlayerProps {
  /** Relative voice-memo URI as stored in the DB (resolved to a full path internally) */
  uri: string;
  /** If provided, shows an X button to remove the voice memo (edit mode only) */
  onRemove?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Format seconds into MM:SS display */
function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Constants
// ============================================================================

const POLL_INTERVAL = 100; // ms

/**
 * Number of raw amplitude samples to extract from the audio file.
 * This is intentionally higher than any bar count so downsampling in
 * WaveformVisualizer preserves detail at every container width.
 */
const AMPLITUDE_SAMPLE_COUNT = 200;

// ============================================================================
// Amplitude cache
// ============================================================================

/**
 * Module-level cache of extracted amplitudes keyed by full URI.
 *
 * Lives for the duration of the JS process (i.e. cleared on app restart).
 * Stale entries for deleted memos are harmless — their AudioPlayers never
 * render again, so cached values are simply never read.
 */
type AmplitudeResult = { amplitudes: number[]; duration: number };
const amplitudeCache = new Map<string, AmplitudeResult>();

// ============================================================================
// Component
// ============================================================================

export function AudioPlayer({ uri: relativeUri, onRemove }: AudioPlayerProps) {
  const { t } = useTranslation();
  const uri = getFullVoiceMemoUri(relativeUri);
  const [foregroundColor, mutedForegroundColor] = useCSSVariable([
    '--color-foreground',
    '--color-border',
  ]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenerIdRef = useRef<number | null>(null);

  // ── Extract amplitude data on mount / URI change ──────────────────
  useEffect(() => {
    // Fast path: serve from cache, no decode needed.
    const cached = amplitudeCache.get(uri);
    if (cached) {
      setAmplitudes(cached.amplitudes);
      setDuration(cached.duration);
      return;
    }

    // Slow path: decode once, cache the result for subsequent mounts.
    let cancelled = false;

    audioEngine
      .extractAmplitudes(uri, AMPLITUDE_SAMPLE_COUNT)
      .then((result) => {
        if (!cancelled) {
          amplitudeCache.set(uri, result);
          setAmplitudes(result.amplitudes);
          setDuration(result.duration);
        }
      })
      .catch(() => {
        // Silently fail — shows flat bars
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  // ── Polling loop for progress ────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      if (audioEngine.currentUri === uri) {
        setCurrentTime(audioEngine.currentTime);
        setDuration(audioEngine.duration);
        setPlaybackState(audioEngine.playbackState);
      } else {
        // Another memo took over
        setPlaybackState('idle');
        setCurrentTime(0);
        stopPolling();
      }
    }, POLL_INTERVAL);
  }, [uri, stopPolling]);

  // ── Playback end listener ────────────────────────────────────────
  useEffect(() => {
    listenerIdRef.current = audioEngine.onPlaybackEnd(() => {
      if (audioEngine.currentUri === null) {
        // Playback ended naturally
        setPlaybackState('idle');
        setCurrentTime(0);
        stopPolling();
      }
    });

    return () => {
      if (listenerIdRef.current !== null) {
        audioEngine.removePlaybackEndListener(listenerIdRef.current);
      }
    };
  }, [stopPolling]);

  // ── Cleanup on unmount (stop if this is the active memo) ─────────
  useEffect(() => {
    return () => {
      stopPolling();
      if (audioEngine.currentUri === uri) {
        audioEngine.stopPlayback();
      }
    };
  }, [uri, stopPolling]);

  // ── Stop audio when screen loses focus (e.g. navigating forward) ──
  // In a stack navigator, pushing a new screen doesn't unmount the
  // previous one, so the unmount cleanup above won't fire.  This blur
  // listener covers that case.
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (audioEngine.currentUri === uri) {
        audioEngine.stopPlayback();
        setPlaybackState('idle');
        setCurrentTime(0);
        stopPolling();
      }
    });
    return unsubscribe;
  }, [navigation, uri, stopPolling]);

  // ── Play / Pause ─────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    const isThisActive = audioEngine.currentUri === uri;
    const state = audioEngine.playbackState;

    if (isThisActive && state === 'playing') {
      audioEngine.pausePlayback();
      setPlaybackState('paused');
      stopPolling();
      setCurrentTime(audioEngine.currentTime);
      return;
    }

    if (isThisActive && state === 'paused') {
      try {
        await audioEngine.resumePlayback();
        setPlaybackState('playing');
        startPolling();
      } catch {
        setPlaybackState('paused');
        stopPolling();
      }
      return;
    }

    // Not active or idle: start fresh
    setPlaybackState('loading');
    try {
      await audioEngine.loadAndPlay(uri);
      setDuration(audioEngine.duration);
      setPlaybackState(audioEngine.playbackState);
      startPolling();
    } catch {
      setPlaybackState('idle');
      setCurrentTime(0);
      stopPolling();
    }
  }, [uri, startPolling, stopPolling]);

  // ── Seek ─────────────────────────────────────────────────────────
  const handleSeek = useCallback(
    async (time: number) => {
      if (audioEngine.currentUri !== uri) {
        // Audio not loaded yet — load it and immediately pause at the seek position
        try {
          await audioEngine.loadAndPlay(uri, time);
          audioEngine.pausePlayback();
          setDuration(audioEngine.duration);
          setPlaybackState('paused');
          setCurrentTime(time);
        } catch {
          setPlaybackState('idle');
          setCurrentTime(0);
          stopPolling();
        }
        return;
      }
      audioEngine.seekTo(time);
      setCurrentTime(time);
    },
    [uri, stopPolling],
  );

  // ── Progress ratio ───────────────────────────────────────────────
  const progress = duration > 0 ? currentTime / duration : 0;
  const isPlaying = playbackState === 'playing';
  const isActiveUri = audioEngine.currentUri === uri;

  return (
    <View
      className="relative bg-muted rounded-2xl px-4 py-3"
      onStartShouldSetResponder={() => true}>
      <View className="flex-row items-center gap-3">
        {/* Play/Pause button */}
        <Button
          variant="ghost"
          size="none"
          onPress={handlePlayPause}
          accessibilityLabel={isPlaying && isActiveUri ? t('Pause') : t('Play')}
          className="w-12 h-12 rounded-full bg-primary">
          <Icon
            as={isPlaying && isActiveUri ? Pause : Play}
            className="text-primary-foreground size-6"
          />
        </Button>

        {/* Duration label */}
        <Text className="text-sm text-foreground font-mono">
          {isActiveUri && (isPlaying || currentTime > 0)
            ? formatTime(currentTime)
            : formatTime(duration)}
        </Text>

        {/* Waveform */}
        <View className="flex-1">
          <WaveformVisualizer
            amplitudes={amplitudes}
            activeColor={foregroundColor as string}
            inactiveColor={mutedForegroundColor as string}
            height={32}
            progress={isActiveUri ? progress : 0}
            duration={duration}
            onSeek={duration > 0 ? handleSeek : undefined}
          />
        </View>
      </View>

      {/* Remove button (edit mode only) */}
      {onRemove && (
        <Button
          variant="ghost"
          size="none"
          onPress={onRemove}
          accessibilityLabel={t('Remove')}
          hitSlop={6}
          className="absolute -top-2 -right-2 z-10 rounded-full">
          <Badge
            variant="secondary"
            className="h-6 w-6 bg-muted-foreground border border-border shadow-lg">
            <Icon as={X} className="text-background size-4" strokeWidth={3} />
          </Badge>
        </Button>
      )}
    </View>
  );
}
