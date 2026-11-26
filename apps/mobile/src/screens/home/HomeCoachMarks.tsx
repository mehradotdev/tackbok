import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ArrowUpDown, Pointer } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { useEntriesGroupByDate } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import {
  measureCoachMarkTarget,
  type CoachMarkTarget,
  type TargetRect,
} from './coachMarkTargets';
import { placeCoachMark, type CoachMarkPlacement } from './coachMarkLayout';

type CoachMark = {
  key: string;
  text: string;
  target: CoachMarkTarget;
  /** Where the bubble goes when the target can't be found on screen. */
  fallbackClassName: string;
};

type ViewHandle = React.ComponentRef<typeof View>;

const DIM = 'bg-black/60';
/** How often a showing tip re-checks where its control is. */
const REMEASURE_MS = 400;

let tipsShowing = false;
/** Whether the Home tips are on screen, so other Home prompts can wait. */
export const homeTipsShowing = () => tipsShowing;

/**
 * One-time walkthrough on the first Home render after onboarding. Each step
 * measures its control (see `useCoachMarkTarget`), dims everything around it
 * and points a bubble at it; the dock step also shows a looping press-and-drag
 * hint. Tapping anywhere advances; "Skip" or Android back ends it. It is marked
 * seen (`hasSeenHomeCoachMarks`) as soon as it shows, so leaving it unfinished
 * never brings it back on the next launch.
 *
 * Screen-reader users skip it entirely — an overlay sequence communicated by
 * position is noise for them.
 */
export function HomeCoachMarks() {
  const { t, isRTL } = useTranslation();
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  const hasSeenHomeCoachMarks = useSettingsStore((s) => s.hasSeenHomeCoachMarks);
  const setHasSeenHomeCoachMarks = useSettingsStore((s) => s.setHasSeenHomeCoachMarks);
  const sampleEntryIds = useSettingsStore((s) => s.sampleEntryIds);
  const { data: entriesByDate, isPending: entriesArePending } = useEntriesGroupByDate();
  const [stepIndex, setStepIndex] = useState(0);
  // Steps are fixed when the tour starts, so entries arriving mid-tour can't
  // shift or shorten them.
  const [tour, setTour] = useState<{ includesEntry: boolean } | null>(null);
  const [placement, setPlacement] = useState<{
    step: number;
    value: CoachMarkPlacement | null;
  } | null>(null);
  const overlayRef = useRef<ViewHandle>(null);

  const shouldStart =
    hasCompletedOnboarding && !hasSeenHomeCoachMarks && !entriesArePending;
  const hasEntries = Boolean(entriesByDate?.size) || sampleEntryIds.length > 0;

  useEffect(() => {
    if (!shouldStart) return;
    setHasSeenHomeCoachMarks(true);
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (enabled) return;
      // A replay from Settings starts over.
      setStepIndex(0);
      setPlacement(null);
      setTour({ includesEntry: hasEntries });
    });
    // Marking the tour seen turns shouldStart off, so later changes to
    // hasEntries don't restart it.
  }, [shouldStart, hasEntries, setHasSeenHomeCoachMarks]);

  // Back closes the tips, but only while Home is on screen: a screen pushed
  // over Home mid-tour (a reminder tap) keeps its own back.
  const isActive = tour !== null;
  useEffect(() => {
    tipsShowing = isActive;
    return () => {
      tipsShowing = false;
    };
  }, [isActive]);
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setTour(null);
        return true;
      });
      return () => subscription.remove();
    }, [isActive]),
  );

  const marks: CoachMark[] = tour
    ? [
        {
          key: 'add-entry',
          text: t('onboarding.addTodaysEntryHere'),
          target: 'dock',
          fallbackClassName: 'bottom-32 right-4',
        },
        {
          key: 'move-dock',
          text: t('onboarding.pressAndHoldThenDragToMoveTheseButtonsAlong'),
          target: 'dock',
          fallbackClassName: 'bottom-32 right-4',
        },
        ...(tour.includesEntry
          ? [
              {
                key: 'entry-card',
                text: t('onboarding.tapAnEntryToViewOrEditIt'),
                target: 'entry' as const,
                fallbackClassName: 'top-36 left-6',
              },
            ]
          : []),
        {
          key: 'search',
          text: t('onboarding.findMemoriesByTextOrTag'),
          target: 'search',
          fallbackClassName: 'top-16 left-3',
        },
      ]
    : [];
  const mark = marks[stepIndex];
  const targetKey = mark?.target;

  // Measured a frame after each step starts, then re-checked while it shows,
  // so the ring follows a control that is still sliding in, moves, resizes,
  // or is replaced (another day becomes the newest), and survives rotation.
  useEffect(() => {
    if (!targetKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = '';
    const measure = () => {
      void measurePlacement(targetKey, overlayRef.current).then((value) => {
        if (cancelled) return;
        const key = JSON.stringify(value);
        if (key !== last) {
          last = key;
          setPlacement({ step: stepIndex, value });
        }
        timer = setTimeout(measure, REMEASURE_MS);
      });
    };
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [stepIndex, targetKey]);

  if (!tour || !mark) return null;

  const isLastStep = stepIndex === marks.length - 1;
  const handleAdvance = () => {
    if (isLastStep) {
      setTour(null);
    } else {
      setStepIndex((prev) => prev + 1);
    }
  };

  const measured = placement?.step === stepIndex;
  const place = measured ? placement.value : null;

  const bubbleContent = (
    <>
      {/* Large text can outgrow the room beside the control; the tip scrolls
          and the buttons stay visible. */}
      <ScrollView className="shrink" style={{ flexGrow: 0 }}>
        <Text className="text-base text-foreground">{mark.text}</Text>
      </ScrollView>
      <View className="flex-row items-center justify-between mt-2 gap-3">
        <Text className="shrink text-xs text-muted-foreground">
          {t('onboarding.stepCurrentOfTotal', {
            current: stepIndex + 1,
            total: marks.length,
          })}
        </Text>
        <View className="flex-row gap-2">
          <Button variant="ghost" size="sm" onPress={() => setTour(null)}>
            <Text className="text-sm text-muted-foreground">{t('onboarding.skip')}</Text>
          </Button>
          <Button variant="primary" size="sm" onPress={handleAdvance}>
            <Text className="text-sm">
              {isLastStep ? t('common.done') : t('onboarding.next')}
            </Text>
          </Button>
        </View>
      </View>
    </>
  );
  const bubbleClassName = 'bg-card border border-border rounded-lg p-3 shadow-theme';

  return (
    <Pressable
      className="absolute inset-0 z-50"
      onPress={handleAdvance}
      accessibilityViewIsModal
      accessibilityLabel={mark.text}>
      {/* Measured coordinates are physical, so this layer lays out LTR even
          in RTL languages; the bubble's own content follows the language. */}
      <View
        ref={overlayRef}
        collapsable={false}
        pointerEvents="box-none"
        className="absolute inset-0"
        style={{ direction: 'ltr' }}>
        {place ? (
          <>
            <HoleDim hole={place.hole} />
            {mark.key === 'move-dock' && (
              <DockDragDemo
                hole={place.hole}
                dragUp={place.above}
                hintOnLeft={place.onRightHalf}
              />
            )}
            <View
              pointerEvents="none"
              className="absolute size-3 rotate-45 bg-card border border-border"
              style={{
                left: place.bubbleLeft + place.arrowLeft,
                ...(place.above
                  ? { bottom: place.bubbleBottom! - 6 }
                  : { top: place.bubbleTop! - 6 }),
              }}
            />
            <View
              className={cn('absolute', bubbleClassName)}
              style={{
                width: place.bubbleWidth,
                maxHeight: place.bubbleMaxHeight,
                left: place.bubbleLeft,
                top: place.bubbleTop,
                bottom: place.bubbleBottom,
                direction: isRTL ? 'rtl' : 'ltr',
              }}>
              {bubbleContent}
            </View>
          </>
        ) : (
          <View pointerEvents="none" className={cn('absolute inset-0', DIM)} />
        )}
      </View>
      {measured && !place && (
        // Written for LTR; React Native's RTL left/right swap mirrors these
        // automatically under forceRTL, matching the mirrored targets.
        <View
          className={cn('absolute max-w-65', bubbleClassName, mark.fallbackClassName)}
          style={{ maxHeight: '60%' }}>
          {bubbleContent}
        </View>
      )}
    </Pressable>
  );
}

/** Where the bubble for a target goes, or null to use the fixed fallback. */
async function measurePlacement(
  targetKey: CoachMarkTarget,
  overlay: ViewHandle | null,
): Promise<CoachMarkPlacement | null> {
  const overlayRect = new Promise<TargetRect | null>((resolve) => {
    if (!overlay) return resolve(null);
    overlay.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
  const [target, overlayBox] = await Promise.all([
    measureCoachMarkTarget(targetKey),
    overlayRect,
  ]);
  return target && overlayBox ? placeCoachMark(target, overlayBox) : null;
}

/** Dims everything except the target, and rings it. */
function HoleDim({ hole }: { hole: TargetRect }) {
  const top = Math.max(hole.y, 0);
  const left = Math.max(hole.x, 0);
  // Only the part of the hole below the top edge, so the strips don't overlap.
  const height = hole.y + hole.height - top;
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <View className={cn('absolute inset-x-0 top-0', DIM)} style={{ height: top }} />
      <View
        className={cn('absolute inset-x-0 bottom-0', DIM)}
        style={{ top: hole.y + hole.height }}
      />
      <View className={cn('absolute left-0', DIM)} style={{ top, height, width: left }} />
      <View
        className={cn('absolute right-0', DIM)}
        style={{ top, height, left: hole.x + hole.width }}
      />
      <View
        className="absolute rounded-2xl border-2 border-white"
        style={{
          left: hole.x,
          top: hole.y,
          width: hole.width,
          height: hole.height,
        }}
      />
    </View>
  );
}

const TOUCH_SIZE = 44;
const DRAG_DISTANCE = 56;
const LOOP_MS = 2800;
const PRESSED_SCALE = 0.82;

/**
 * A finger that presses and holds on the dock, then drags it along the edge,
 * on a loop. Under Reduce Motion: the pressed finger with an up/down arrow.
 */
function DockDragDemo({
  hole,
  dragUp,
  hintOnLeft,
}: {
  hole: TargetRect;
  dragUp: boolean;
  /** Side for the Reduce Motion arrow: away from the screen edge. */
  hintOnLeft: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const direction = dragUp ? -1 : 1;

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: LOOP_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  // 0–0.08 appear · 0.08–0.16 press · hold until 0.35 · drag until 0.65 ·
  // release by 0.72 · fade by 0.8 · pause.
  const fingerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.08, 0.72, 0.8], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0.35, 0.65],
            [0, direction * DRAG_DISTANCE],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            p,
            [0.08, 0.16, 0.65, 0.72],
            [1, PRESSED_SCALE, PRESSED_SCALE, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  // A ripple while the press is held, so "hold" reads as more than a tap.
  const rippleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0.14, 0.18, 0.35], [0, 0.8, 0], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(p, [0.14, 0.35], [0.8, 1.9], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const centre = {
    left: hole.x + hole.width / 2 - TOUCH_SIZE / 2,
    top: hole.y + hole.height / 2 - TOUCH_SIZE / 2,
  };
  const touch = (
    <View
      className="items-center justify-center rounded-full border-2 border-black/30 bg-white/90"
      style={{ width: TOUCH_SIZE, height: TOUCH_SIZE }}>
      <Icon as={Pointer} className="size-6 text-black" />
    </View>
  );

  if (reduceMotion) {
    return (
      <View
        pointerEvents="none"
        className="absolute"
        style={{ ...centre, transform: [{ scale: PRESSED_SCALE }] }}>
        {touch}
        <View
          className={cn(
            'absolute items-center justify-center rounded-full bg-white/90 p-1',
            hintOnLeft ? '-left-9' : '-right-9',
          )}>
          <Icon as={ArrowUpDown} className="size-5 text-black" />
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="none" className="absolute" style={centre}>
      <Animated.View
        className="absolute rounded-full border-2 border-white"
        style={[{ width: TOUCH_SIZE, height: TOUCH_SIZE }, rippleStyle]}
      />
      <Animated.View style={fingerStyle}>{touch}</Animated.View>
    </View>
  );
}
