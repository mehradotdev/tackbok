import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Linking, ActivityIndicator } from 'react-native';
import { File } from 'expo-file-system';
import {
  Headphones,
  X,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Save,
} from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { SHEET_NAMES } from '~/constants';
import { audioEngine } from '~/lib/audioEngine';
import { useTranslation } from '~/lib/i18n';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { StaticWaveform } from '~/components/StaticWaveform';
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
  onVoiceMemoSaved: (tempUri: string) => void;
}

type RecorderPhase = 'idle' | 'recording' | 'normalizing' | 'preview';

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
const MAX_RECORDING_DURATION_SECONDS = 30 * 60;
const MAX_RECORDING_DURATION_MS = MAX_RECORDING_DURATION_SECONDS * 1000;

// ============================================================================
// Component
// ============================================================================

export function VoiceMemoModal({ onVoiceMemoSaved }: IVoiceMemoModalProps) {
  const { t } = useTranslation();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

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
  const maxRecordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenerIdRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const stopRecordingHandlerRef = useRef<((autoSave?: boolean) => void) | null>(null);
  const previewLoadIdRef = useRef(0);
  // Prevent a dismiss->cleanup race: after Save we hand `recordedUri` to the parent to persist,
  // but `onDidDismiss` still fires; we must not delete the temp file in that case.
  const didSaveRef = useRef(false);

  const [foregroundColor, mutedForegroundColor] = useCSSVariable([
    '--color-foreground',
    '--color-border',
  ]);

  const resetRecorderState = useCallback(() => {
    previewLoadIdRef.current += 1;
    setPhase('idle');
    setRecordedUri(null);
    setRecordingDuration(0);
    setPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewDuration(0);
    setPreviewAmplitudes([]);
  }, []);

  const deleteTempRecording = useCallback((uri: string | null) => {
    if (!uri) return;

    try {
      const tempFile = new File(uri);
      if (tempFile.exists) tempFile.delete();
    } catch {
      // Ignore — temp dir cleanup is best-effort
    }
  }, []);

  // ── Polling helpers ────────────────────────────────────────────────
  const stopDurationPoll = useCallback(() => {
    if (durationPollRef.current !== null) {
      clearInterval(durationPollRef.current);
      durationPollRef.current = null;
    }
  }, []);

  const stopPlaybackPoll = useCallback(() => {
    if (playbackPollRef.current !== null) {
      clearInterval(playbackPollRef.current);
      playbackPollRef.current = null;
    }
  }, []);

  const stopMaxRecordingTimer = useCallback(() => {
    if (maxRecordingTimeoutRef.current !== null) {
      clearTimeout(maxRecordingTimeoutRef.current);
      maxRecordingTimeoutRef.current = null;
    }
  }, []);

  const startDurationPoll = useCallback(() => {
    stopDurationPoll();
    durationPollRef.current = setInterval(() => {
      setRecordingDuration(audioEngine.getRecordingDuration());
    }, POLL_INTERVAL);
  }, [stopDurationPoll]);

  const startPlaybackPoll = useCallback(() => {
    stopPlaybackPoll();
    playbackPollRef.current = setInterval(() => {
      if (audioEngine.playbackState === 'playing') {
        setPreviewCurrentTime(audioEngine.currentTime);
        setPreviewDuration(audioEngine.duration);
      }
    }, POLL_INTERVAL);
  }, [stopPlaybackPoll]);

  // Enter preview mode and load waveform data, ignoring stale extraction results.
  const hydratePreviewWaveform = useCallback((uri: string) => {
    setPhase('preview');
    setPreviewAmplitudes([]);
    const previewLoadId = ++previewLoadIdRef.current;

    audioEngine
      .extractAmplitudes(uri, 200)
      .then((data) => {
        if (previewLoadIdRef.current === previewLoadId) {
          setPreviewAmplitudes(data.amplitudes);
        }
      })
      .catch(() => {});
  }, []);

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
  }, [stopPlaybackPoll]);

  // ── Recording (with permission check) ──────────────────────────────
  const startRecording = useCallback(async (): Promise<boolean> => {
    didSaveRef.current = false;
    stopMaxRecordingTimer();
    const result = await audioEngine.startRecording();
    if (result.status === 'error') {
      console.warn('Failed to start recording:', result.message);
      return false;
    }
    setPhase('recording');
    setRecordingDuration(0);
    startDurationPoll();
    maxRecordingTimeoutRef.current = setTimeout(() => {
      stopRecordingHandlerRef.current?.(true);
    }, MAX_RECORDING_DURATION_MS);
    return true;
  }, [startDurationPoll, stopMaxRecordingTimer]);

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
    await TrueSheet.dismiss(SHEET_NAMES.VOICE_MEMO);
    setPermissionAlertOpen(true);
  }, [startRecording]);

  const handleStopRecording = useCallback(
    async (autoSave = false) => {
      if (isStoppingRef.current) return;
      isStoppingRef.current = true;
      stopDurationPoll();
      stopMaxRecordingTimer();
      try {
        const result = audioEngine.stopRecording();
        if (result.path) {
          setPhase('normalizing');

          try {
            // Normalize audio to boost quiet recordings (esp. on Android)
            const normalizedUri = await audioEngine.normalizeAudio(result.path);

            setRecordedUri(normalizedUri);
            setPreviewDuration(result.duration ?? 0);

            if (autoSave) {
              didSaveRef.current = true;
              await TrueSheet.dismiss(SHEET_NAMES.VOICE_MEMO);
              onVoiceMemoSaved(normalizedUri);
              return;
            }

            hydratePreviewWaveform(normalizedUri);
          } catch {
            // If normalization fails, fall back to the original recording
            setRecordedUri(result.path);
            setPreviewDuration(result.duration ?? 0);

            if (autoSave) {
              didSaveRef.current = true;
              await TrueSheet.dismiss(SHEET_NAMES.VOICE_MEMO);
              onVoiceMemoSaved(result.path);
              return;
            }

            hydratePreviewWaveform(result.path);
          }
        } else {
          setPhase('idle');
        }
      } finally {
        isStoppingRef.current = false;
      }
    },
    [hydratePreviewWaveform, onVoiceMemoSaved, stopDurationPoll, stopMaxRecordingTimer],
  );

  useEffect(() => {
    stopRecordingHandlerRef.current = handleStopRecording;
  }, [handleStopRecording]);

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
  const handleSave = useCallback(() => {
    if (recordedUri) {
      didSaveRef.current = true;
      audioEngine.stopPlayback();
      setPreviewPlaying(false);
      stopPlaybackPoll();
      TrueSheet.dismiss(SHEET_NAMES.VOICE_MEMO);
      onVoiceMemoSaved(recordedUri);
    }
  }, [recordedUri, onVoiceMemoSaved, stopPlaybackPoll]);

  // ── Audio activity cleanup ────────────────────────────────────────
  const stopAudioActivity = useCallback(() => {
    audioEngine.stopPlayback();
    if (audioEngine.isRecording) {
      const result = audioEngine.stopRecording();
      deleteTempRecording(result.path ?? null);
    }
    stopDurationPoll();
    stopMaxRecordingTimer();
    stopPlaybackPoll();
  }, [deleteTempRecording, stopDurationPoll, stopMaxRecordingTimer, stopPlaybackPoll]);

  const handleDiscardRecording = useCallback(() => {
    didSaveRef.current = false;
    stopAudioActivity();
    deleteTempRecording(recordedUri);
    resetRecorderState();
  }, [deleteTempRecording, recordedUri, resetRecorderState, stopAudioActivity]);

  // ── Unmount cleanup ────────────────────────────────────────────────
  useEffect(() => {
    return stopAudioActivity;
  }, [stopAudioActivity]);

  const handleDismiss = useCallback(() => {
    stopAudioActivity();

    // Clean up unsaved temp recording file (best-effort)
    if (recordedUri && !didSaveRef.current) {
      deleteTempRecording(recordedUri);
    }

    resetRecorderState();
  }, [deleteTempRecording, recordedUri, resetRecorderState, stopAudioActivity]);

  const previewProgress = previewDuration > 0 ? previewCurrentTime / previewDuration : 0;

  return (
    <>
      <TrueSheet
        name={SHEET_NAMES.VOICE_MEMO}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber={phase === 'idle'}
        grabberOptions={{
          topMargin: 8,
          color: mutedFgColor as string,
          adaptive: false,
        }}
        dismissible={phase === 'idle'}
        backgroundColor={backgroundColor as string}
        onDidDismiss={handleDismiss}>
        <View className="px-6 pt-4 pb-4">
          {/* Close button */}
          {phase === 'idle' && (
            <Button
              variant="ghost"
              size="icon"
              onPress={() => TrueSheet.dismiss(SHEET_NAMES.VOICE_MEMO)}
              hitSlop={8}
              accessibilityLabel={t('Close')}
              className="absolute top-4 right-6 z-10 w-8 h-8 px-0">
              <Icon as={X} className="text-muted-foreground size-6" />
            </Button>
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
              <Text className="text-xl font-body-bold text-foreground text-center mb-2">
                {t('Record Voice Note')}
              </Text>
              <Text className="text-base text-muted-foreground text-center mb-6">
                {t('Tap the button below when ready.')}
              </Text>
              <Button
                variant="default"
                className="w-full h-14"
                onPress={handleStartRecording}>
                <Icon as={Mic} className="text-background size-5" />
                <Text>{t('Start Recording')}</Text>
              </Button>
            </>
          )}

          {/* === NORMALIZING PHASE === */}
          {phase === 'normalizing' && (
            <>
              <Text className="text-xl font-body-bold text-foreground text-center mb-2">
                {t('Processing Audio...')}
              </Text>
              <Text className="text-base text-muted-foreground text-center mb-6">
                {t('Optimizing your recording.')}
              </Text>
              <View className="items-center mb-4">
                <ActivityIndicator size="large" color={foregroundColor as string} />
              </View>
            </>
          )}

          {/* === RECORDING PHASE === */}
          {phase === 'recording' && (
            <>
              <Text className="text-xl font-body-bold text-foreground text-center mb-2">
                {t('Recording Voice Note...')}
              </Text>
              <Text className="text-4xl font-body-bold text-foreground text-center mb-4">
                {formatTime(recordingDuration)}
              </Text>
              <Text className="text-sm text-muted-foreground text-center mb-4">
                {t('Voice notes save automatically at 30:00.')}
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
                className="w-full h-14"
                onPress={() => handleStopRecording()}>
                <Icon as={Square} className="text-background size-4" />
                <Text>{t('Stop Recording')}</Text>
              </Button>
            </>
          )}

          {/* === PREVIEW PHASE === */}
          {phase === 'preview' && (
            <>
              <Text className="text-xl font-body-bold text-foreground text-center mb-2">
                {t('Voice Note Recorded')}
              </Text>
              <Text className="text-base text-muted-foreground text-center mb-4">
                {t('Tap on the play button to listen.')}
              </Text>

              {/* Play/Pause button */}
              <Button
                variant="secondary"
                size="icon"
                onPress={handlePlayPause}
                accessibilityLabel={previewPlaying ? t('Pause') : t('Play')}
                accessibilityState={{ selected: previewPlaying }}
                className="self-center w-16 h-16 rounded-full bg-muted items-center justify-center mb-2">
                <Icon
                  as={previewPlaying ? Pause : Play}
                  className="text-foreground size-8"
                />
              </Button>

              {/* Waveform + time labels */}
              <View className="mb-6">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-foreground font-body-semibold w-10 text-right">
                    {formatTime(previewCurrentTime)}
                  </Text>
                  <View className="flex-1">
                    <StaticWaveform
                      amplitudes={previewAmplitudes}
                      activeColor={foregroundColor as string}
                      inactiveColor={mutedForegroundColor as string}
                      height={32}
                      progress={previewProgress}
                      duration={previewDuration}
                      onSeek={handleSeek}
                    />
                  </View>
                  <Text className="text-sm text-foreground font-body-semibold w-10">
                    {formatTime(previewDuration)}
                  </Text>
                </View>
              </View>

              {/* Save and discard buttons */}
              <View className="gap-3">
                <Button variant="default" className="w-full h-14" onPress={handleSave}>
                  <Icon as={Save} className="text-background size-5" />
                  <Text>{t('Save Recording')}</Text>
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-14"
                  onPress={handleDiscardRecording}>
                  <Icon as={Trash2} className="text-destructive size-5" />
                  <Text>{t('Discard Recording')}</Text>
                </Button>
              </View>
            </>
          )}
        </View>
      </TrueSheet>

      {/* Permission denied alert */}
      <AlertDialog open={permissionAlertOpen} onOpenChange={setPermissionAlertOpen}>
        <AlertDialogContent className={sheetRadius === 0 ? 'rounded-none' : ''}>
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
