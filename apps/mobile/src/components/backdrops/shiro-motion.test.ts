import {
  shiroIdle,
  shiroIdleBark,
  shiroPerformance,
  nextShiroBarkCount,
  nextShiroBarkDelay,
} from './shiro-motion';

describe('Shiro choreography', () => {
  it('returns exactly to rest and keeps the reduced-motion greeting still', () => {
    expect(shiroPerformance(0)).toEqual({ turn: 0, tilt: 0, mouth: 0 });
    expect(shiroPerformance(4)).toEqual({ turn: 0, tilt: 0, mouth: 0 });
    expect(shiroPerformance(-1)).toEqual({ turn: 1, tilt: 0.16, mouth: 0 });
  });

  it('barks twice only after facing the viewer, and closes the mouth between barks', () => {
    for (const time of [1.86, 2.36]) {
      expect(shiroPerformance(time).turn).toBe(1);
      expect(shiroPerformance(time).mouth).toBeCloseTo(1);
    }
    expect(shiroPerformance(2.1).mouth).toBe(0);
    expect(shiroPerformance(0.45).mouth).toBe(0);
    expect(shiroPerformance(3.5).mouth).toBe(0);
  });

  it('keeps every sampled pose bounded and continuous through the authored middle view', () => {
    let previous = shiroPerformance(0);
    for (let i = 1; i <= 4000; i++) {
      const next = shiroPerformance(i / 1000);
      expect(next.turn).toBeGreaterThanOrEqual(0);
      expect(next.turn).toBeLessThanOrEqual(1);
      expect(Math.abs(next.turn - previous.turn)).toBeLessThan(0.002);
      expect(next.mouth).toBeGreaterThanOrEqual(0);
      expect(next.mouth).toBeLessThanOrEqual(1);
      previous = next;
    }
  });

  it('starts with a static preview pose and loops wagging without a seam', () => {
    expect(shiroIdle(0)).toEqual({ blink: 0, ear: 0, tail: 0 });
    expect(shiroIdle(31.2).tail).toBeCloseTo(shiroIdle(0).tail);
    expect(shiroIdle(0.3).tail).toBeGreaterThan(0);
    expect(shiroIdle(0.9).tail).toBeLessThan(0);
  });
});

it('draws one or two quick barks with a closed mouth between them', () => {
  expect(shiroIdleBark(0.2, 1)).toBeCloseTo(1);
  expect(shiroIdleBark(0.63, 1)).toBe(0);
  expect(shiroIdleBark(0.2, 2)).toBeCloseTo(1);
  expect(shiroIdleBark(0.4, 2)).toBe(0);
  expect(shiroIdleBark(0.63, 2)).toBeCloseTo(1);
  expect(shiroIdleBark(0.85, 2)).toBe(0);
});

it('independently randomizes bark count and a two-to-five-second quiet interval', () => {
  const random = jest.spyOn(Math, 'random');
  try {
    random.mockReturnValue(0);
    expect(nextShiroBarkDelay()).toBe(2000);
    expect(nextShiroBarkCount()).toBe(1);
    random.mockReturnValue(0.9999);
    expect(nextShiroBarkDelay()).toBeLessThanOrEqual(5000);
    expect(nextShiroBarkDelay()).toBeGreaterThan(4999);
    expect(nextShiroBarkCount()).toBe(2);
  } finally {
    random.mockRestore();
  }
});
