import React, { useCallback, useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

// ============================================================================
// Types
// ============================================================================

interface StaticWaveformProps {
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
/** Raw peak floor below which static bars are treated as visual silence. */
const STATIC_NOISE_FLOOR = 0.01;
/**
 * Clips whose loudest raw peak is below this are shown flat instead of being
 * normalized up to full height — stops near-silence from rendering as speech.
 */
const STATIC_MIN_CLIP_PEAK = 0.03;
/**
 * Bars are normalized against this percentile of the voiced chunk peaks rather
 * than the absolute maximum, so one loud blip (tap, door slam) clamps to full
 * height instead of shrinking every other bar.
 */
const STATIC_REFERENCE_PERCENTILE = 0.95;
/** Compression that keeps quiet passages visible without flattening loud ones. */
const STATIC_EXPONENT = 0.74;
/** Minimum displayed amplitude so quiet bars do not disappear visually. */
const MIN_DISPLAY_AMPLITUDE = 0.1;
/** Minimum rendered bar height in points. */
const MIN_BAR_HEIGHT = 3;

// StaticWaveform owns the final display curve for extracted chunk peaks.
// Bars are scaled relative to the clip's own loudness so heights show the
// recording's internal dynamics; absolute loudness is already equalized by
// playback gain in audioEngine.
function shapeStaticDisplayAmplitude(level: number, referencePeak: number): number {
  const reference = Math.max(referencePeak, STATIC_MIN_CLIP_PEAK);
  const gated = Math.max(0, level - STATIC_NOISE_FLOOR);
  const normalized = Math.min(1, gated / Math.max(reference - STATIC_NOISE_FLOOR, 0.001));
  return Math.pow(normalized, STATIC_EXPONENT);
}

/**
 * Robust per-clip reference level: the STATIC_REFERENCE_PERCENTILE-th peak of
 * the chunks above the noise floor. Returns 0 for an entirely silent clip
 * (shapeStaticDisplayAmplitude then falls back to STATIC_MIN_CLIP_PEAK).
 */
function computeReferencePeak(amplitudes: number[]): number {
  const voiced = amplitudes.filter((a) => a > STATIC_NOISE_FLOOR);
  if (voiced.length === 0) return 0;

  voiced.sort((a, b) => a - b);
  return voiced[Math.floor(STATIC_REFERENCE_PERCENTILE * (voiced.length - 1))];
}

// ============================================================================
// Component
// ============================================================================

export function StaticWaveform({
  amplitudes,
  activeColor,
  inactiveColor,
  height = 40,
  progress = 0,
  duration = 0,
  onSeek,
}: StaticWaveformProps) {
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
      return new Array(Math.max(barCount, 0)).fill(MIN_DISPLAY_AMPLITUDE);
    }

    const result: number[] = [];
    const step = amplitudes.length / barCount;

    const referencePeak = computeReferencePeak(amplitudes);

    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(Math.floor((i + 1) * step), amplitudes.length);

      let peak = 0;
      for (let j = start; j < end; j++) {
        if (amplitudes[j] > peak) peak = amplitudes[j];
      }

      const shapedPeak = shapeStaticDisplayAmplitude(peak, referencePeak);
      result.push(Math.max(MIN_DISPLAY_AMPLITUDE, shapedPeak));
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

    const activeBuilder = Skia.PathBuilder.Make();
    const inactiveBuilder = Skia.PathBuilder.Make();

    if (w <= 0 || totalBars === 0) {
      return {
        activePath: activeBuilder.detach(),
        inactivePath: inactiveBuilder.detach(),
      };
    }

    const midY = height / 2;
    const maxBarHeight = height * 0.9;
    const progressX = progress * w;

    for (let i = 0; i < totalBars; i++) {
      const x = i * (BAR_WIDTH + BAR_GAP);
      const amplitude = bars[i] ?? MIN_DISPLAY_AMPLITUDE;
      const barH = Math.max(MIN_BAR_HEIGHT, amplitude * maxBarHeight);
      const y = midY - barH / 2;
      const radius = Math.min(BAR_WIDTH / 2, 1.5);
      const barRect = Skia.RRectXY(Skia.XYWHRect(x, y, BAR_WIDTH, barH), radius, radius);

      if (x + BAR_WIDTH <= progressX) {
        activeBuilder.addRRect(barRect);
      } else if (x >= progressX) {
        inactiveBuilder.addRRect(barRect);
      } else {
        const playedW = progressX - x;
        const unplayedW = BAR_WIDTH - playedW;

        if (playedW > 0) {
          activeBuilder.addRRect(
            Skia.RRectXY(Skia.XYWHRect(x, y, playedW, barH), radius, radius),
          );
        }
        if (unplayedW > 0) {
          inactiveBuilder.addRRect(
            Skia.RRectXY(Skia.XYWHRect(x + playedW, y, unplayedW, barH), radius, radius),
          );
        }
      }
    }

    return {
      activePath: activeBuilder.detach(),
      inactivePath: inactiveBuilder.detach(),
    };
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
