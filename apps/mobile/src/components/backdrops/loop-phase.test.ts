import { delayedCycle, easeInOutQuad, easeInOutSine, pingPong } from './loop-phase';

// Reanimated's easings, as the old withTiming/withRepeat loops used them.
const sin = (x: number) => 1 - Math.cos((x * Math.PI) / 2);
const quad = (x: number) => x * x;
const inOut = (easing: (x: number) => number) => (x: number) =>
  x < 0.5 ? easing(x * 2) / 2 : 1 - easing((1 - x) * 2) / 2;

/** withRepeat(withTiming(1, { duration: half }), -1, true) starting from 0. */
function reversingTiming(time: number, half: number, easing: (x: number) => number) {
  const lap = Math.floor(time / half);
  const progress = easing((time - lap * half) / half);
  return lap % 2 === 0 ? progress : 1 - progress;
}

/** Botanical sway: 0.5 → 1 with Easing.out(sin), then 1 ↔ 0 with inOut(sin). */
function botanicalSway(time: number) {
  if (time < 2.25) return 0.5 + 0.5 * Math.sin(((time / 2.25) * Math.PI) / 2);
  return 1 - reversingTiming(time - 2.25, 4.5, inOut(sin));
}

const samples = Array.from({ length: 2000 }, (_, i) => i * 0.137);

describe('loop phases', () => {
  it('matches the reversing eased timings the backdrops used to run', () => {
    for (const time of samples) {
      expect(easeInOutSine(pingPong(time, 48))).toBeCloseTo(
        reversingTiming(time, 48, inOut(sin)),
        6,
      );
      expect(easeInOutSine(pingPong(time, 7))).toBeCloseTo(
        reversingTiming(time, 7, inOut(sin)),
        6,
      );
      expect(easeInOutQuad(pingPong(time, 36))).toBeCloseTo(
        reversingTiming(time, 36, inOut(quad)),
        6,
      );
      expect(0.5 + 0.5 * Math.sin((2 * Math.PI * time) / 9)).toBeCloseTo(
        botanicalSway(time),
        6,
      );
    }
  });

  it('covers the full 0 → 1 range on every lap, wherever the clock resumes', () => {
    for (const start of [0, 13.3, 50, 1234.5]) {
      const lap = Array.from({ length: 961 }, (_, i) => pingPong(start + i * 0.1, 48));
      expect(Math.min(...lap)).toBeCloseTo(0, 1);
      expect(Math.max(...lap)).toBeCloseTo(1, 1);
    }
  });

  it('waits before the first bird crossing, then repeats from 0', () => {
    expect(delayedCycle(0, 8, 10)).toBe(-1);
    expect(delayedCycle(7.99, 8, 10)).toBe(-1);
    expect(delayedCycle(8, 8, 10)).toBe(0);
    expect(delayedCycle(13, 8, 10)).toBeCloseTo(0.5);
    expect(delayedCycle(18, 8, 10)).toBe(0);
    expect(delayedCycle(1009, 8, 10)).toBeCloseTo(0.1);
  });

  it('keeps the still pose at time 0', () => {
    expect(easeInOutSine(pingPong(0, 48))).toBe(0);
    expect(easeInOutQuad(pingPong(0, 36))).toBe(0);
  });
});
