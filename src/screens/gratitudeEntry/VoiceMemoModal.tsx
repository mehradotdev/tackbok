import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Headphones, X, Mic, Square, Play, Pause } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { audioEngine } from '~/lib/audioEngine';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { BottomSheet } from '~/components/ui/BottomSheet';
import { WaveformVisualizer } from '~/components/WaveformVisualizer';
import { LiveWaveform } from '~/components/LiveWaveform';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';

// ============================================================================
// Types
// ============================================================================

interface IVoiceMemoModalProps {
  visible: boolean;
  onClose: () => void;
  onVoiceMemoSaved: (tempUri: string) => void;
}

type RecorderPhase = 'idle' | 'recording' | 'preview';

// ============================================================================
// Helpers
// ============================================================================

/** Format seconds into MM:SS display */
function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const POLL_INTERVAL = 200; // ms

// ============================================================================
// Component
// ============================================================================

export function VoiceMemoModal({
  visible,
  onClose,
  onVoiceMemoSaved,
}: IVoiceMemoModalProps) {
  const { t } = useTranslation();

  // Recorder state
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Preview playback state
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewAmplitudes, setPreviewAmplitudes] = useState<number[]>([]);

  // Permission alert state
  const [permissionAlertOpen, setPermissionAlertOpen] = useState(false);

  const durationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenerIdRef = useRef<number | null>(null);

  const [foregroundColor, mutedForegroundColor] = useCSSVariable([
    '--color-foreground',
    '--color-border',
  ]);

  // ── Playback end listener ──────────────────────────────────────────
  useEffect(() => {
    listenerIdRef.current = audioEngine.onPlaybackEnd(() => {
      setPreviewPlaying(false);
      setPreviewCurrentTime(0);
      stopPlaybackPoll();
    });

    return () => {
      if (listenerIdRef.current !== null) {
        audioEngine.removePlaybackEndListener(listenerIdRef.current);
      }
    };
  }, []);

  // ── Polling helpers ────────────────────────────────────────────────
  const startDurationPoll = useCallback(() => {
    stopDurationPoll();
    durationPollRef.current = setInterval(() => {
      setRecordingDuration(audioEngine.getRecordingDuration());
    }, POLL_INTERVAL);
  }, []);

  const stopDurationPoll = useCallback(() => {
    if (durationPollRef.current !== null) {
      clearInterval(durationPollRef.current);
      durationPollRef.current = null;
    }
  }, []);

  const startPlaybackPoll = useCallback(() => {
    stopPlaybackPoll();
    playbackPollRef.current = setInterval(() => {
      if (audioEngine.playbackState === 'playing') {
        setPreviewCurrentTime(audioEngine.currentTime);
        setPreviewDuration(audioEngine.duration);
      }
    }, POLL_INTERVAL);
  }, []);

  const stopPlaybackPoll = useCallback(() => {
    if (playbackPollRef.current !== null) {
      clearInterval(playbackPollRef.current);
      playbackPollRef.current = null;
    }
  }, []);

  // ── Recording (with permission check) ──────────────────────────────
  const startRecording = useCallback(async (): Promise<boolean> => {
    const result = await audioEngine.startRecording();
    if (result.status === 'error') {
      console.warn('Failed to start recording:', result.message);
      return false;
    }
    setPhase('recording');
    setRecordingDuration(0);
    startDurationPoll();
    return true;
  }, [startDurationPoll]);

  const handleStartRecording = useCallback(async () => {
    // Check current permission status without prompting
    const currentStatus = await audioEngine.checkPermission();

    if (currentStatus === 'Granted') {
      await startRecording();
      return;
    }

    if (currentStatus === 'Undetermined') {
      // Ask the OS for permission
      const requestResult = await audioEngine.requestPermission();
      if (requestResult === 'Granted') {
        await startRecording();
        return;
      }
    }

    // Permission denied — close sheet and show alert
    onClose();
    setPermissionAlertOpen(true);
  }, [onClose, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopDurationPoll();
    const result = audioEngine.stopRecording();
    if (result.path) {
      setRecordedUri(result.path);
      setPreviewDuration(result.duration ?? 0);
      setPhase('preview');

      // Extract amplitudes for the preview waveform
      audioEngine
        .extractAmplitudes(result.path, 200)
        .then((data) => setPreviewAmplitudes(data.amplitudes))
        .catch(() => {});
    } else {
      setPhase('idle');
    }
  }, [stopDurationPoll]);

  // ── Preview Playback ───────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!recordedUri) return;

    if (previewPlaying) {
      audioEngine.pausePlayback();
      setPreviewPlaying(false);
      stopPlaybackPoll();
      setPreviewCurrentTime(audioEngine.currentTime);
      return;
    }

    const state = audioEngine.playbackState;
    if (audioEngine.currentUri === recordedUri && state === 'paused') {
      await audioEngine.resumePlayback();
      setPreviewPlaying(true);
      startPlaybackPoll();
      return;
    }

    // Fresh play
    await audioEngine.loadAndPlay(recordedUri);
    setPreviewPlaying(true);
    setPreviewDuration(audioEngine.duration);
    startPlaybackPoll();
  }, [recordedUri, previewPlaying, startPlaybackPoll, stopPlaybackPoll]);

  const handleSeek = useCallback(
    (time: number) => {
      if (!recordedUri || audioEngine.currentUri !== recordedUri) return;
      audioEngine.seekTo(time);
      setPreviewCurrentTime(time);
    },
    [recordedUri],
  );

  // ── Actions ────────────────────────────────────────────────────────
  const handleRecordAgain = useCallback(() => {
    audioEngine.stopPlayback();
    setPreviewPlaying(false);
    stopPlaybackPoll();
    setRecordedUri(null);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
    setPhase('idle');
  }, [stopPlaybackPoll]);

  const handleSave = useCallback(() => {
    if (recordedUri) {
      audioEngine.stopPlayback();
      setPreviewPlaying(false);
      stopPlaybackPoll();
      onClose();
      onVoiceMemoSaved(recordedUri);
    }
  }, [recordedUri, onClose, onVoiceMemoSaved, stopPlaybackPoll]);

  // ── Audio activity cleanup ────────────────────────────────────────
  // Shared by handleClose (explicit dismissal) and the unmount effect
  // (parent-driven unmount). Stops audio and clears all pollers without
  // invoking any parent callbacks, so it's safe to call from both paths.
  const stopAudioActivity = useCallback(() => {
    audioEngine.stopPlayback();
    if (audioEngine.isRecording) {
      audioEngine.stopRecording();
    }
    stopDurationPoll();
    stopPlaybackPoll();
  }, [stopDurationPoll, stopPlaybackPoll]);

  // ── Unmount cleanup ────────────────────────────────────────────────
  useEffect(() => {
    return stopAudioActivity;
  }, [stopAudioActivity]);

  // ── Reset state when sheet closes ──────────────────────────────────
  useEffect(() => {
    if (!visible) {
      stopAudioActivity();
      const timer = setTimeout(() => {
        setPhase('idle');
        setRecordedUri(null);
        setRecordingDuration(0);
        setPreviewPlaying(false);
        setPreviewCurrentTime(0);
        setPreviewDuration(0);
        setPreviewAmplitudes([]);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [visible, stopAudioActivity]);

  const handleClose = useCallback(() => {
    stopAudioActivity();
    setPreviewPlaying(false);
    onClose();
  }, [onClose, stopAudioActivity]);

  const previewProgress = previewDuration > 0 ? previewCurrentTime / previewDuration : 0;

  return (
    <>
      <BottomSheet
        isOpen={visible}
        onClose={handleClose}
        showHandle={true}
        dismissible={phase === 'idle'}>
        <View className="px-6 pt-2 pb-4">
          {/* Close button */}
          {phase !== 'idle' && (
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              accessibilityLabel={t('Close')}
              className="absolute top-2 right-6 z-10 p-1">
              <Icon as={X} className="text-muted-foreground size-6" />
            </Pressable>
          )}

          {/* Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
              <Icon as={Headphones} className="text-muted-foreground size-8" />
            </View>
          </View>

          {/* === IDLE PHASE === */}
          {phase === 'idle' && (
            <>
              <Text className="text-xl font-bold text-foreground text-center mb-2">
                {t('Record Voice Note')}
              </Text>
              <Text className="text-base text-muted-foreground text-center mb-6">
                {t('Tap the button below when ready.')}
              </Text>
              <Button
                variant="default"
                className="w-full h-14 rounded-full"
                onPress={handleStartRecording}>
                <Icon as={Mic} className="text-background size-5" />
                <Text>{t('Start Recording')}</Text>
              </Button>
            </>
          )}

          {/* === RECORDING PHASE === */}
          {phase === 'recording' && (
            <>
              <Text className="text-xl font-bold text-foreground text-center mb-2">
                {t('Recording Voice Note...')}
              </Text>
              <Text className="text-4xl font-bold text-foreground text-center mb-4 font-mono">
                {formatTime(recordingDuration)}
              </Text>

              {/* Live waveform during recording */}
              <View className="mb-6 mx-2">
                <LiveWaveform
                  color={foregroundColor as string}
                  height={48}
                  isActive={phase === 'recording'}
                />
              </View>

              <Button
                variant="default"
                className="w-full h-14 rounded-full"
                onPress={handleStopRecording}>
                <Icon as={Square} className="text-background size-4" />
                <Text>{t('Stop Recording')}</Text>
              </Button>
            </>
          )}

          {/* === PREVIEW PHASE === */}
          {phase === 'preview' && (
            <>
              <Text className="text-xl font-bold text-foreground text-center mb-2">
                {t('Voice Note Recorded')}
              </Text>
              <Text className="text-base text-muted-foreground text-center mb-4">
                {t('Tap on the play button to listen.')}
              </Text>

              {/* Play/Pause button */}
              <Pressable
                onPress={handlePlayPause}
                accessibilityLabel={previewPlaying ? t('Pause') : t('Play')}
                accessibilityState={{ selected: previewPlaying }}
                className="self-center w-16 h-16 rounded-full bg-muted items-center justify-center mb-2">
                <Icon
                  as={previewPlaying ? Pause : Play}
                  className="text-foreground size-8"
                />
              </Pressable>

              {/* Waveform + time labels */}
              <View className="mb-6">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-foreground font-semibold w-10 text-right">
                    {formatTime(previewCurrentTime)}
                  </Text>
                  <View className="flex-1">
                    <WaveformVisualizer
                      amplitudes={previewAmplitudes}
                      activeColor={foregroundColor as string}
                      inactiveColor={mutedForegroundColor as string}
                      height={32}
                      progress={previewProgress}
                      duration={previewDuration}
                      onSeek={handleSeek}
                    />
                  </View>
                  <Text className="text-sm text-foreground font-semibold w-10">
                    {formatTime(previewDuration)}
                  </Text>
                </View>
              </View>

              {/* Save and Record Again buttons */}
              <View className="gap-3">
                <Button
                  variant="default"
                  className="w-full h-14 rounded-full"
                  onPress={handleSave}>
                  <Text>{t('Save Recording')}</Text>
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-14 rounded-full"
                  onPress={handleRecordAgain}>
                  <Icon as={Mic} className="text-foreground size-5" />
                  <Text>{t('Record Again')}</Text>
                </Button>
              </View>
            </>
          )}
        </View>
      </BottomSheet>

      {/* Permission denied alert */}
      <AlertDialog open={permissionAlertOpen} onOpenChange={setPermissionAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Microphone Access Required')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Please enable microphone access in your device settings to record voice memos.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setPermissionAlertOpen(false)}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setPermissionAlertOpen(false);
                Linking.openSettings();
              }}>
              <Text>{t('Open Settings')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
