import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';
import Storage from 'expo-sqlite/kv-store';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '~/components/ui/text';
import { useSettingsStore } from '~/lib/settings';
import { useTranslation } from '~/lib/i18n';
import {
  chooseGreeting,
  chooseGreetingEmoji,
  greetingUnits,
  fitGreeting,
} from './greeting';

// A JS runtime is one cold start; route remounts and foregrounding must not replay.
let launchGreetingClaimed = false;
const PREVIOUS_KEY = 'home.previous-greeting';
const DURATION = 4270;
type GreetingMessage = { label: string };

export function useHeaderGreeting(isSearchMode: boolean) {
  const { t, isReady } = useTranslation();
  const hydrated = useSettingsStore((s) => s._hasHydrated);
  const name = useSettingsStore((s) => s.profileName);
  const focused = useIsFocused();
  const [laidOut, setLaidOut] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  const reducedMotion = useReducedMotion();
  const [pending, setPending] = useState(() => !launchGreetingClaimed);
  const [messages, setMessages] = useState<GreetingMessage[] | null>(null);
  const [step, setStep] = useState(0);
  const [measured, setMeasured] = useState(0);
  const onMessageReady = useCallback((index: number) => {
    setMeasured((value) => value | (1 << index));
  }, []);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (
      launchGreetingClaimed ||
      !laidOut ||
      !hydrated ||
      !isReady ||
      !focused ||
      isSearchMode ||
      (appState && appState !== 'active')
    )
      return;
    // Start after layout, keeping the header blank until the first greeting.
    const start = setTimeout(() => {
      if (launchGreetingClaimed) return;
      launchGreetingClaimed = true;
      let previous: string | null = null;
      try {
        previous = Storage.getItemSync(PREVIOUS_KEY);
      } catch {
        /* Greeting works without storage. */
      }
      const key = chooseGreeting(new Date(), previous);
      try {
        Storage.setItemSync(PREVIOUS_KEY, key);
      } catch {
        /* Best-effort repeat prevention. */
      }
      const cleanName = name?.trim();
      // GreetingLine segments the final localized text into safe animation units.
      const first = cleanName
        ? t('greeting.withName', { greeting: t('greeting.welcomeBack'), name: cleanName })
        : t('greeting.welcomeBack');
      const second = `${t(key)}! ${chooseGreetingEmoji(key)}`;
      setStep(0);
      setMessages([{ label: first + '!' }, { label: second }]);
      setPending(false);
    }, 0);
    return () => clearTimeout(start);
  }, [appState, focused, hydrated, isReady, isSearchMode, laidOut, name, t]);

  useEffect(() => {
    if (!messages) return;
    const finish = () => {
      cancelAnimation(progress);
      // Keep the controls visible while React commits active=false. Resetting to
      // zero here can hide them for a frame on the UI thread (Android flicker).
      progress.value = DURATION;
      setMessages(null);
      setPending(false);
    };
    if (!focused || isSearchMode || (appState && appState !== 'active')) {
      finish();
      return;
    }
    if (measured !== 3) {
      // A missing native layout callback must never leave the controls hidden.
      const fallback = setTimeout(finish, 1500);
      return () => clearTimeout(fallback);
    }
    progress.value = 0;
    // Give the mounted text layers a frame to reach the native UI before timing them.
    const start = setTimeout(() => {
      if (!reducedMotion) {
        progress.value = withTiming(DURATION, {
          duration: DURATION,
          easing: Easing.linear,
        });
      }
    }, 250);
    const next = setTimeout(() => setStep(1), 250 + (reducedMotion ? 1500 : 1840));
    const timer = setTimeout(finish, 250 + (reducedMotion ? 3000 : DURATION));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') finish();
    });
    return () => {
      clearTimeout(start);
      clearTimeout(next);
      clearTimeout(timer);
      subscription.remove();
      cancelAnimation(progress);
    };
  }, [appState, focused, measured, messages, isSearchMode, progress, reducedMotion]);

  return {
    messages,
    onMessageReady,
    greeting: messages?.[step] ?? null,
    step,
    active: pending || !!messages,
    progress,
    reducedMotion,
    onLayout: () => setLaidOut(true),
  };
}

type MotionProps = React.PropsWithChildren<{
  progress: SharedValue<number>;
  active: boolean;
  reducedMotion: boolean;
  index: number;
  greeting?: boolean;
  step?: number;
  unitCount?: number;
  className?: string;
  shrink?: boolean;
}>;

export function HeaderMotion({
  progress,
  active,
  reducedMotion,
  index,
  greeting = false,
  step = 0,
  unitCount = 1,
  className,
  shrink,
  children,
}: MotionProps) {
  const style = useAnimatedStyle(() => {
    if (!active) return { opacity: 1, transform: [{ translateY: 0 }] };
    if (reducedMotion)
      return { opacity: greeting ? 1 : 0, transform: [{ translateY: 0 }] };
    const delay = greeting
      ? index * Math.min(36, 400 / Math.max(1, unitCount - 1))
      : index * 120;
    const times = greeting
      ? step === 0
        ? [150 + delay, 570 + delay, 1640, 1840]
        : [1840 + delay, 2260 + delay, 3400, 3600]
      : [3600 + delay, 4000 + delay, 4320, 4420];
    // Smoothstep gives each entrance/exit a gentle ease without spring overshoot.
    const entrance = interpolate(progress.value, times.slice(0, 2), [0, 1], 'clamp');
    const exit = interpolate(progress.value, times.slice(2), [0, 1], 'clamp');
    const a = entrance * entrance * (3 - 2 * entrance);
    const b = exit * exit * (3 - 2 * exit);
    return {
      opacity: greeting ? a * (1 - b) : a,
      transform: [
        {
          translateY: greeting ? 10 * (1 - a) - 10 * b : 32 * (1 - a),
        },
      ],
    };
  });
  return (
    <Animated.View
      className={className}
      style={[shrink ? { flexShrink: 1, minWidth: 0 } : undefined, style]}>
      {children}
    </Animated.View>
  );
}

export function HeaderGreeting({
  messages,
  onMessageReady,
  step,
  progress,
  reducedMotion,
}: ReturnType<typeof useHeaderGreeting>) {
  const { isRTL } = useTranslation();
  if (!messages) return null;
  return (
    <>
      {messages.map((message, messageIndex) => (
        <View
          key={messageIndex}
          pointerEvents="none"
          className="absolute inset-0 justify-center px-safe-or-4"
          style={reducedMotion && step !== messageIndex ? { opacity: 0 } : undefined}
          accessible={step === messageIndex}
          accessibilityElementsHidden={step !== messageIndex}
          importantForAccessibility={
            step === messageIndex ? 'yes' : 'no-hide-descendants'
          }
          accessibilityLabel={message.label}
          accessibilityLiveRegion="polite">
          <GreetingLine
            onReady={onMessageReady}
            text={message.label}
            progress={progress}
            reducedMotion={reducedMotion}
            step={messageIndex}
            isRTL={isRTL}
          />
        </View>
      ))}
    </>
  );
}

/** Measure the complete row before revealing it, then fit every unit at the same scale. */
function GreetingLine({
  isRTL,
  ...props
}: {
  onReady: (step: number) => void;
  text: string;
  progress: SharedValue<number>;
  reducedMotion: boolean;
  step: number;
  isRTL: boolean;
}) {
  // Keep mixed-direction text in one native paragraph. Separate animated views
  // let Yoga reverse Latin letters and multiword names along with the RTL row.
  if (isRTL) {
    return (
      <HeaderMotion
        progress={props.progress}
        active
        reducedMotion={props.reducedMotion}
        index={0}
        greeting
        step={props.step}>
        <Text
          variant="h2"
          className="text-primary-foreground font-heading"
          style={{ writingDirection: 'rtl', textAlign: 'auto' }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          onLayout={() => props.onReady(props.step)}>
          {props.text}
        </Text>
      </HeaderMotion>
    );
  }
  return <AnimatedGreetingLine {...props} isRTL={isRTL} />;
}

function AnimatedGreetingLine({
  onReady,
  text,
  progress,
  reducedMotion,
  step,
  isRTL,
}: {
  onReady: (step: number) => void;
  text: string;
  progress: SharedValue<number>;
  reducedMotion: boolean;
  step: number;
  isRTL: boolean;
}) {
  const units = useMemo(() => greetingUnits(text), [text]);
  const [available, setAvailable] = useState(0);
  const [widths, setWidths] = useState<Record<number, number>>({});
  const ready =
    available > 0 &&
    units.every((_, index) => widths[index] !== undefined) &&
    widths[units.length] !== undefined;
  useEffect(() => {
    if (ready) onReady(step);
  }, [ready, onReady, step]);
  const fit = fitGreeting(
    units.map((_, index) => widths[index] ?? 0),
    available,
    widths[units.length] ?? 0,
  );
  const visible = units.slice(0, fit.count);
  if (fit.truncated) visible.push('…');
  const lineWidth = visible.reduce(
    (sum, _, index) =>
      sum + (index === fit.count ? (widths[units.length] ?? 0) : (widths[index] ?? 0)),
    0,
  );
  return (
    <View
      className="w-full justify-center"
      onLayout={(event) => setAvailable(event.nativeEvent.layout.width)}>
      {/* This unconstrained row gives us real native font and accessibility-scale metrics. */}
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', opacity: 0, flexDirection: 'row', width: 100000 }}>
        {[...units, '…'].map((unit, index) => (
          <Text
            key={index}
            variant="h2"
            className="font-heading"
            numberOfLines={1}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setWidths((previous) =>
                previous[index] === width ? previous : { ...previous, [index]: width },
              );
            }}>
            {unit}
          </Text>
        ))}
      </View>
      <View
        style={{
          opacity: ready ? 1 : 0,
          width: lineWidth,
          // Native RTL already mirrors row order and the start edge.
          flexDirection: 'row',
          alignSelf: 'flex-start',
          // Transform origins use physical edges, so this still needs RTL.
          transformOrigin: isRTL ? 'right center' : 'left center',
          transform: [{ scale: fit.scale }],
        }}>
        {visible.map((unit, index) => (
          <HeaderMotion
            key={index}
            progress={progress}
            active
            reducedMotion={reducedMotion}
            index={index}
            unitCount={visible.length}
            greeting
            step={step}>
            <Text
              numberOfLines={1}
              variant="h2"
              className="text-primary-foreground font-heading"
              style={{ writingDirection: isRTL ? 'rtl' : 'ltr' }}>
              {unit}
            </Text>
          </HeaderMotion>
        ))}
      </View>
    </View>
  );
}
