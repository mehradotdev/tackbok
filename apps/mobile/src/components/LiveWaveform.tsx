import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { audioEngine } from '~/lib/audioEngine';

// ============================================================================
// Types
// ============================================================================

interface LiveWaveformProps {
  /** Bar color */
  color: string;
  /** Height of the waveform container (default 48) */
  height?: number;
  /** Width of each bar in points (default 2.5) */
  barWidth?: number;
  /** Gap between bars in points (default 1.5) */
  barGap?: number;
  /** When true the animation loop is running (start/stop with recording) */
  isActive: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** How often (ms) a new amplitude sample is appended to the rolling buffer. */
const SAMPLE_INTERVAL_MS = 50; // ~20 samples/sec

/** Minimum bar height ratio so silent bars are still visible. */
const MIN_BAR = 0.04;

// ============================================================================
// Component
// ============================================================================

export function LiveWaveform({
  color,
  height = 48,
  barWidth = 2.5,
  barGap = 1.5,
  isActive,
}: LiveWaveformProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const bufferRef = useRef<number[]>([]);
  const lastSampleTimeRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const [, forceRender] = useState(0); // render tick to trigger re-render when buffer updates

  // ── Layout ─────────────────────────────────────────────────────────
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // ── Derived bar count ──────────────────────────────────────────────
  const barCount = useMemo(() => {
    if (containerWidth <= 0) return 0;
    return Math.max(1, Math.floor((containerWidth + barGap) / (barWidth + barGap)));
  }, [containerWidth, barWidth, barGap]);

  // ── Reset buffer when we start recording or bar count changes ──────
  useEffect(() => {
    if (isActive) {
      bufferRef.current = [];
      lastSampleTimeRef.current = 0;
      forceRender((n) => n + 1);
    }
  }, [isActive, barCount]);

  // ── Animation loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || barCount <= 0) {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const tick = () => {
      const now = performance.now();

      // Throttle: only push a new sample every SAMPLE_INTERVAL_MS
      if (now - lastSampleTimeRef.current >= SAMPLE_INTERVAL_MS) {
        lastSampleTimeRef.current = now;

        const amplitude = audioEngine.getCurrentAmplitude();
        const buf = bufferRef.current;

        buf.push(Math.max(MIN_BAR, amplitude));

        // Trim to window size
        if (buf.length > barCount) {
          buf.splice(0, buf.length - barCount);
        }

        // Trigger render
        forceRender((n) => n + 1);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isActive, barCount]);

  // ── Build Skia path ────────────────────────────────────────────────
  const skiaPath = (() => {
    const p = Skia.Path.Make();
    if (containerWidth <= 0 || barCount <= 0) return p;

    const buf = bufferRef.current;
    const midY = height / 2;
    const maxBarHeight = height * 0.9;
    const totalSlots = barCount;

    // Bars are right-aligned: the newest sample sits at the rightmost slot.
    // Empty slots on the left are left blank (no bar drawn).
    const startSlot = totalSlots - buf.length;

    for (let i = 0; i < buf.length; i++) {
      const slot = startSlot + i;
      const x = slot * (barWidth + barGap);
      const amplitude = buf[i];
      const barH = Math.max(2, amplitude * maxBarHeight);
      const y = midY - barH / 2;
      const radius = Math.min(barWidth / 2, 1.5);

      p.addRRect(Skia.RRectXY(Skia.XYWHRect(x, y, barWidth, barH), radius, radius));
    }

    return p;
  })();

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }}>
      {containerWidth > 0 && (
        <Canvas style={{ flex: 1 }}>
          <Path path={skiaPath} color={color} />
        </Canvas>
      )}
    </View>
  );
}
