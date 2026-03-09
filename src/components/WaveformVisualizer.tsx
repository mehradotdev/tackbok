import React, { useCallback, useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

// ============================================================================
// Types
// ============================================================================

interface WaveformVisualizerProps {
  /** Full-track peak amplitudes (0..1), one per logical sample */
  amplitudes?: number[];
  /** Foreground color for the already-played portion */
  activeColor: string;
  /** Muted/dim color for the not-yet-played portion */
  inactiveColor: string;
  /** Height of the waveform container */
  height?: number;
  /** Progress ratio 0..1 for the fill effect (played portion) */
  progress?: number;
  /** Duration in seconds, used for seek calculations */
  duration?: number;
  /** Called with a time (seconds) when the user taps/scrubs to seek */
  onSeek?: (time: number) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Width of each waveform bar in points */
const BAR_WIDTH = 3;
/** Gap between bars in points */
const BAR_GAP = 2;

// ============================================================================
// Component
// ============================================================================

export function WaveformVisualizer({
  amplitudes,
  activeColor,
  inactiveColor,
  height = 40,
  progress = 0,
  duration = 0,
  onSeek,
}: WaveformVisualizerProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  // ── Layout ─────────────────────────────────────────────────────────
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // ── Compute bar count from container width ─────────────────────────
  const barCount = useMemo(() => {
    if (containerWidth <= 0) return 0;
    return Math.max(1, Math.floor((containerWidth + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
  }, [containerWidth]);

  // ── Downsample static amplitudes to match bar count ────────────────
  const bars = useMemo(() => {
    if (barCount <= 0 || !amplitudes || amplitudes.length === 0) {
      return new Array(Math.max(barCount, 0)).fill(0.08);
    }

    const result: number[] = [];
    const step = amplitudes.length / barCount;

    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(Math.floor((i + 1) * step), amplitudes.length);

      let peak = 0;
      for (let j = start; j < end; j++) {
        if (amplitudes[j] > peak) peak = amplitudes[j];
      }

      result.push(Math.max(0.08, peak));
    }

    return result;
  }, [amplitudes, barCount]);

  // ── Gesture handling (tap & pan to seek) ───────────────────────────
  const handleSeek = useCallback(
    (x: number) => {
      if (!onSeek || !duration || containerWidth <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / containerWidth));
      onSeek(ratio * duration);
    },
    [onSeek, duration, containerWidth],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        'worklet';
        scheduleOnRN(handleSeek, e.x);
      }),
    [handleSeek],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          'worklet';
          scheduleOnRN(handleSeek, e.x);
        })
        .minDistance(0),
    [handleSeek],
  );

  const composedGesture = useMemo(
    () => Gesture.Race(tapGesture, panGesture),
    [tapGesture, panGesture],
  );

  // ── Build Skia paths ───────────────────────────────────────────────
  const { activePath, inactivePath } = useMemo(() => {
    const w = containerWidth;
    const totalBars = bars.length;

    const activeP = Skia.Path.Make();
    const inactiveP = Skia.Path.Make();

    if (w <= 0 || totalBars === 0) {
      return { activePath: activeP, inactivePath: inactiveP };
    }

    const midY = height / 2;
    const maxBarHeight = height * 0.9;
    const progressX = progress * w;

    for (let i = 0; i < totalBars; i++) {
      const x = i * (BAR_WIDTH + BAR_GAP);
      const amplitude = bars[i] ?? 0.08;
      const barH = Math.max(2, amplitude * maxBarHeight);
      const y = midY - barH / 2;
      const radius = Math.min(BAR_WIDTH / 2, 1.5);

      if (x + BAR_WIDTH <= progressX) {
        activeP.addRRect(
          Skia.RRectXY(Skia.XYWHRect(x, y, BAR_WIDTH, barH), radius, radius),
        );
      } else if (x >= progressX) {
        inactiveP.addRRect(
          Skia.RRectXY(Skia.XYWHRect(x, y, BAR_WIDTH, barH), radius, radius),
        );
      } else {
        const playedW = progressX - x;
        const unplayedW = BAR_WIDTH - playedW;

        if (playedW > 0) {
          activeP.addRRect(
            Skia.RRectXY(Skia.XYWHRect(x, y, playedW, barH), radius, radius),
          );
        }
        if (unplayedW > 0) {
          inactiveP.addRRect(
            Skia.RRectXY(Skia.XYWHRect(x + playedW, y, unplayedW, barH), radius, radius),
          );
        }
      }
    }

    return { activePath: activeP, inactivePath: inactiveP };
  }, [bars, progress, height, containerWidth]);

  // ── Render ─────────────────────────────────────────────────────────
  const content = (
    <View onLayout={onLayout} style={{ height, width: '100%' }}>
      {containerWidth > 0 && (
        <Canvas style={{ flex: 1 }}>
          <Path path={inactivePath} color={inactiveColor} />
          <Path path={activePath} color={activeColor} />
        </Canvas>
      )}
    </View>
  );

  // Wrap in gesture detector only if seeking is enabled
  if (onSeek && duration > 0) {
    return <GestureDetector gesture={composedGesture}>{content}</GestureDetector>;
  }

  return content;
}
