// Loop phases derived from a forward clock (`useForwardTime`), so a paused scene
// resumes mid-loop over the loop's full range instead of restarting a timing.

/** Forward time wraps after six hours on screen, long before float precision
 *  blurs motion. Loop periods should divide it so the wrap is seamless. */
export const WRAP_SECONDS = 6 * 60 * 60;

/** 0 → 1 → 0 triangle that takes `halfPeriod` seconds each way. */
export function pingPong(time: number, halfPeriod: number) {
  'worklet';
  const phase = (time / halfPeriod) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

/** Easing.inOut(Easing.sin). */
export function easeInOutSine(x: number) {
  'worklet';
  return (1 - Math.cos(Math.PI * x)) / 2;
}

/** Easing.inOut(Easing.quad). */
export function easeInOutQuad(x: number) {
  'worklet';
  return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
}

/** -1 for the first `delay` seconds, then a 0 → 1 ramp repeating every `period`. */
export function delayedCycle(time: number, delay: number, period: number) {
  'worklet';
  return time < delay ? -1 : ((time - delay) % period) / period;
}
