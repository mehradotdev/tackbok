export const SHIRO_PERFORMANCE_MS = 4000;
export const SHIRO_STILL_MS = 1800;
export const SHIRO_IDLE_BARK_MS = 850;
export const SHIRO_SINGLE_BARK_MS = 400;

/** Quiet time between idle bark bursts, independent of the wagging loop. */
export function nextShiroBarkDelay() {
  return 2000 + Math.random() * 3000;
}

export function nextShiroBarkCount(): 1 | 2 {
  return Math.random() < 0.5 ? 1 : 2;
}

function easeBetween(time: number, start: number, end: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return p * p * (3 - 2 * p);
}

function pulse(time: number, start: number, end: number) {
  'worklet';
  if (time <= start || time >= end) return 0;
  return Math.sin(((time - start) / (end - start)) * Math.PI) ** 2;
}

/** Seconds on a four-second, non-looping performance; -1 is the still greeting. */
export function shiroPerformance(time: number) {
  'worklet';
  if (time < 0) return { turn: 1, tilt: 0.16, mouth: 0 };
  const turn = easeBetween(time, 0, 0.9) * (1 - easeBetween(time, 3, 4));
  const mouth = pulse(time, 1.7, 2.02) + pulse(time, 2.2, 2.52);
  const tilt = 0.16 * easeBetween(time, 0.95, 1.4) * (1 - easeBetween(time, 2.7, 3.3));
  return { turn, tilt: tilt - mouth * 0.025, mouth };
}

export function shiroIdleBark(time: number, count: number) {
  'worklet';
  return pulse(time, 0.05, 0.35) + (count === 2 ? pulse(time, 0.48, 0.78) : 0);
}

/** Continuous gentle wagging and occasional blinks; barking has its own clock. */
export function shiroIdle(time: number) {
  'worklet';
  return {
    blink: pulse(time, 4.6, 4.88) + pulse(time, 11.2, 11.5) + pulse(time, 18.7, 19),
    ear: Math.sin((time - 12) * 14) * pulse(time, 12, 12.8) * 0.04,
    tail: Math.sin((time * Math.PI * 2) / 1.2) * 0.095,
  };
}
