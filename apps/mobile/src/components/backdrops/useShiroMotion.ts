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
import {
  nextShiroBarkCount,
  nextShiroBarkDelay,
  SHIRO_SINGLE_BARK_MS,
  SHIRO_IDLE_BARK_MS,
  SHIRO_PERFORMANCE_MS,
  SHIRO_STILL_MS,
} from './shiro-motion';

export function useShiroMotion(preview: boolean) {
  const reducedMotion = useReducedMotion();
  const idle = useSharedValue(0);
  const performance = useSharedValue(0);
  const bark = useSharedValue(0);
  const barkCount = useSharedValue(1);
  const interaction = usePetInteraction();
  const register = interaction?.register;
  const setBusy = interaction?.setBusy;

  useFocusEffect(
    useCallback(() => {
      let busy = false;
      let active = false;
      let generation = 0;
      let unregister: (() => void) | undefined;
      let stillTimer: ReturnType<typeof setTimeout> | undefined;
      let barkTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        active = false;
        generation += 1;
        busy = false;
        clearTimeout(stillTimer);
        clearTimeout(barkTimer);
        cancelAnimation(idle);
        cancelAnimation(bark);
        cancelAnimation(performance);
        idle.value = 0;
        performance.value = 0;
        bark.value = 0;
        if (unregister) {
          unregister();
          setBusy?.(false);
          unregister = undefined;
        }
      };
      const scheduleBark = () => {
        if (!active || busy || reducedMotion) return;
        clearTimeout(barkTimer);
        const currentGeneration = generation;
        barkTimer = setTimeout(() => {
          if (!active || busy || generation !== currentGeneration) return;
          bark.value = 0;
          barkCount.value = nextShiroBarkCount();
          const duration =
            barkCount.value === 1 ? SHIRO_SINGLE_BARK_MS : SHIRO_IDLE_BARK_MS;
          const finishedBarking = () => {
            if (!active || busy || generation !== currentGeneration) return;
            bark.value = 0;
            scheduleBark();
          };
          bark.value = withTiming(
            duration / 1000,
            {
              duration,
              easing: Easing.linear,
            },
            (finished) => {
              if (finished) scheduleOnRN(finishedBarking);
            },
          );
        }, nextShiroBarkDelay());
      };
      const play = () => {
        if (!active || busy) return;
        busy = true; // Synchronous guard also catches taps before React rerenders.
        setBusy?.(true);
        const currentGeneration = ++generation;
        clearTimeout(barkTimer);
        cancelAnimation(bark);
        bark.value = 0;
        const finish = () => {
          if (!active || currentGeneration !== generation) return;
          performance.value = 0;
          busy = false;
          setBusy?.(false);
          scheduleBark();
        };
        if (reducedMotion) {
          performance.value = -1;
          stillTimer = setTimeout(finish, SHIRO_STILL_MS);
        } else {
          performance.value = 0;
          performance.value = withTiming(
            4,
            {
              duration: SHIRO_PERFORMANCE_MS,
              easing: Easing.linear,
            },
            (finished) => {
              if (finished) scheduleOnRN(finish);
            },
          );
        }
      };
      const start = () => {
        stop();
        if (preview) return;
        active = true;
        if (!reducedMotion) {
          // 31.2s contains exactly 26 tail cycles: no seam.
          idle.value = withRepeat(
            withTiming(31.2, { duration: 31200, easing: Easing.linear }),
            -1,
          );
          scheduleBark();
        }
        unregister = register?.(play);
      };
      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') start();
        else stop();
      });
      return () => {
        subscription.remove();
        stop();
      };
    }, [preview, reducedMotion, idle, bark, barkCount, performance, register, setBusy]),
  );

  return { idle, performance, bark, barkCount };
}
