import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { usePetInteraction } from './PetInteraction';

export function useShadowMotion(preview: boolean) {
  const reduced = useReducedMotion();
  const idle = useSharedValue(0);
  const performance = useSharedValue(0);
  const variant = useSharedValue(0);
  const interaction = usePetInteraction();
  const register = interaction?.register;
  const setBusy = interaction?.setBusy;
  useFocusEffect(
    useCallback(() => {
      let active = false;
      let busy = false;
      let generation = 0;
      let unregister: (() => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        active = false;
        busy = false;
        generation++;
        clearTimeout(timer);
        cancelAnimation(idle);
        cancelAnimation(performance);
        idle.value = 0;
        performance.value = 0;
        if (unregister) {
          unregister();
          setBusy?.(false);
          unregister = undefined;
        }
      };
      const play = () => {
        if (!active || busy) return;
        busy = true;
        setBusy?.(true);
        const ticket = ++generation;
        variant.value = Math.random() < 0.5 ? 0 : 1;
        const finish = () => {
          if (!active || ticket !== generation) return;
          performance.value = 0;
          busy = false;
          setBusy?.(false);
        };
        if (reduced) {
          performance.value = -1;
          timer = setTimeout(finish, 1800);
        } else {
          performance.value = 0;
          performance.value = withTiming(
            4,
            { duration: 4000, easing: Easing.linear },
            (done) => {
              if (done) scheduleOnRN(finish);
            },
          );
        }
      };
      const start = () => {
        stop();
        if (preview) return;
        active = true;
        if (!reduced)
          idle.value = withRepeat(
            withTiming(24, { duration: 24000, easing: Easing.linear }),
            -1,
          );
        unregister = register?.(play);
      };
      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) =>
        state === 'active' ? start() : stop(),
      );
      return () => {
        subscription.remove();
        stop();
      };
    }, [preview, reduced, idle, performance, variant, register, setBusy]),
  );
  return { idle, performance, variant };
}
