import { useCallback, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, type ViewStyle } from 'react-native';
import {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '~/lib/settings/store';
import type { GratitudeActionDockConfig } from '~/screens/home/GratitudeActionDock';

interface UseGratitudeActionDockPresentationOptions {
  dockConfig: GratitudeActionDockConfig;
  isExpanded: boolean;
  isRTL: boolean;
  onToggle: () => void;
}

type DockAnimatedStyle = ReturnType<typeof useAnimatedStyle<ViewStyle>>;

interface UseGratitudeActionDockPresentationResult {
  /** Animated inner panel shape and borders for docked vs detached states. */
  containerStyle: DockAnimatedStyle;
  /**
   * True once the absolute-positioning container has been measured and the dock
   * can render at its real persisted/default Y without a first-paint jump.
   */
  hasMeasured: boolean;
  /** Measures the available vertical space so drag bounds can be clamped correctly. */
  onContainerLayout: (e: LayoutChangeEvent) => void;
  /** Long-press pan gesture that detaches the dock, tracks vertical drag, and snaps back on release. */
  panGesture: ReturnType<typeof Gesture.Pan>;
  /** Shared expand progress from 0 collapsed to 1 expanded, consumed by child animations. */
  progress: SharedValue<number>;
  /** Animated outer shell width, corner radius, and expansion shift. */
  shellShadowStyle: DockAnimatedStyle;
  /** Animated absolute positioning for the whole dock, including drag float and active scale. */
  wrapperStyle: DockAnimatedStyle;
}

/**
 * Builds the dock's animated presentation layer.
 *
 * This hook owns the dock's drag-to-reposition interaction, persisted vertical
 * placement, haptics, and the animated styles that render the collapsed and
 * expanded shell. It does not decide when the dock should expand or collapse
 * from timeline scrolling; that policy lives in the scroll behavior hook.
 */
export function useGratitudeActionDockPresentation({
  dockConfig,
  isExpanded,
  isRTL,
  onToggle,
}: UseGratitudeActionDockPresentationOptions): UseGratitudeActionDockPresentationResult {
  const { animation, dimensions, gesture } = dockConfig;
  const persistedY = useSettingsStore((s) => s.actionDockY);
  const setPersistedY = useSettingsStore((s) => s.setActionDockY);

  const [containerHeight, setContainerHeight] = useState(0);
  const hasMeasured = containerHeight > 0;

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  }, []);

  const minY = gesture.verticalPadding;
  const maxY = Math.max(
    minY,
    containerHeight - dimensions.panelHeight - gesture.verticalPadding,
  );
  const defaultY = Math.max(minY, Math.round(containerHeight * 0.7));
  const inwardFloatX = isRTL
    ? animation.inwardFloatOffsetX
    : -animation.inwardFloatOffsetX;
  const expandedShellShiftX = isRTL
    ? animation.expandedShellShiftX
    : -animation.expandedShellShiftX;

  const clampY = useCallback(
    (y: number) => {
      'worklet';
      return Math.min(maxY, Math.max(minY, y));
    },
    [minY, maxY],
  );

  const progress = useSharedValue(isExpanded ? 1 : 0);
  const positionY = useSharedValue(clampY(persistedY ?? defaultY));
  const floatX = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const dragStartY = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(isExpanded ? 1 : 0, animation.spring);
  }, [animation.spring, isExpanded, progress]);

  useEffect(() => {
    if (containerHeight > 0) {
      const target = persistedY !== null ? clampY(persistedY) : clampY(defaultY);
      positionY.value = target;
    }
  }, [clampY, containerHeight, defaultY, persistedY, positionY]);

  const persistPosition = useCallback(
    (y: number) => {
      setPersistedY(Math.round(y));
    },
    [setPersistedY],
  );

  const triggerDragStartHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const triggerDragEndHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const finishDetachedDrag = useCallback(
    (shouldTriggerHaptic: boolean) => {
      'worklet';
      if (!isDragging.value) return;

      isDragging.value = false;
      progress.value = withSpring(0, animation.spring);
      floatX.value = withSpring(0, animation.snapSpring);
      dragScale.value = withSpring(1, animation.snapSpring);
      scheduleOnRN(persistPosition, positionY.value);

      if (shouldTriggerHaptic) {
        scheduleOnRN(triggerDragEndHaptic);
      }
    },
    [
      animation.snapSpring,
      animation.spring,
      dragScale,
      floatX,
      isDragging,
      persistPosition,
      positionY,
      progress,
      triggerDragEndHaptic,
    ],
  );

  const startDetachedDrag = useCallback(() => {
    'worklet';
    if (progress.value > gesture.expandedProgressThreshold) {
      progress.value = withSpring(0, animation.spring);
      scheduleOnRN(onToggle);
    }

    isDragging.value = true;
    dragStartY.value = positionY.value;
    floatX.value = withSpring(inwardFloatX, animation.snapSpring);
    dragScale.value = withSpring(animation.dragActiveScale, animation.snapSpring);
    scheduleOnRN(triggerDragStartHaptic);
  }, [
    animation.dragActiveScale,
    animation.snapSpring,
    animation.spring,
    dragScale,
    dragStartY,
    floatX,
    gesture.expandedProgressThreshold,
    inwardFloatX,
    isDragging,
    onToggle,
    positionY,
    progress,
    triggerDragStartHaptic,
  ]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Keep the hold-to-drag interaction inside one recognizer.
        // A separate LongPress + Pan pair made diagonal drags easy to cancel.
        .activateAfterLongPress(gesture.longPressDurationMs)
        .onStart(startDetachedDrag)
        .onUpdate((e) => {
          'worklet';
          if (!isDragging.value) return;
          const newY = dragStartY.value + e.translationY;
          positionY.value = clampY(newY);
        })
        .onEnd(() => {
          'worklet';
          finishDetachedDrag(true);
        })
        .onFinalize(() => {
          'worklet';
          finishDetachedDrag(false);
        }),
    [
      clampY,
      dragStartY,
      finishDetachedDrag,
      gesture.longPressDurationMs,
      isDragging,
      positionY,
      startDetachedDrag,
    ],
  );

  const wrapperStyle = useAnimatedStyle(() => ({
    top: positionY.value,
    transform: [{ translateX: floatX.value }, { scale: dragScale.value }],
  }));

  const shellShadowStyle = useAnimatedStyle(() => {
    const dragging = isDragging.value;
    const detachedEdgeRadius = dragging ? dimensions.cornerRadius : 0;

    return {
      width: interpolate(
        progress.value,
        [0, 1],
        [dimensions.tabWidth, dimensions.expandedWidth],
        Extrapolation.CLAMP,
      ),
      height: dimensions.panelHeight,
      transform: [
        {
          translateX: interpolate(
            progress.value,
            [0, 1],
            [0, expandedShellShiftX],
            Extrapolation.CLAMP,
          ),
        },
      ],
      // Keep physical left/right geometry in LTR terms here.
      // React Native swaps these edge styles for RTL, so manual mirroring
      // would double-flip the dock shell.
      borderTopLeftRadius: dimensions.cornerRadius,
      borderBottomLeftRadius: dimensions.cornerRadius,
      borderTopRightRadius: detachedEdgeRadius,
      borderBottomRightRadius: detachedEdgeRadius,
    };
  });

  const containerStyle = useAnimatedStyle(() => {
    const dragging = isDragging.value;
    const detachedEdgeRadius = dragging ? dimensions.cornerRadius : 0;
    const detachedEdgeBorderWidth = dragging ? 1 : 0;

    return {
      flex: 1,
      borderTopLeftRadius: dimensions.cornerRadius,
      borderBottomLeftRadius: dimensions.cornerRadius,
      borderTopRightRadius: detachedEdgeRadius,
      borderBottomRightRadius: detachedEdgeRadius,
      borderLeftWidth: 1,
      borderRightWidth: detachedEdgeBorderWidth,
    };
  });

  return {
    containerStyle,
    hasMeasured,
    onContainerLayout,
    panGesture,
    progress,
    shellShadowStyle,
    wrapperStyle,
  };
}
