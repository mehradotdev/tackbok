import { DENISE_HEAD_LOOP, deniseHeadPose } from './denise-shader';
import { WRAP_SECONDS as WRAP } from './loop-phase';

const samples = Array.from({ length: 4800 }, (_, i) => i * 0.01);

describe('deniseHeadPose', () => {
  it('rests at the start of every loop, so the still picker matches the texture', () => {
    for (const t of [0, DENISE_HEAD_LOOP, 3 * DENISE_HEAD_LOOP, WRAP]) {
      const pose = deniseHeadPose(t);
      expect(pose.angle).toBeCloseTo(0, 6);
      expect(pose.dx).toBeCloseTo(0, 6);
      expect(pose.dy).toBeCloseTo(0, 6);
    }
  });

  it('loops seamlessly and divides the clock wrap', () => {
    expect(WRAP % DENISE_HEAD_LOOP).toBe(0);
    for (const t of samples) {
      const a = deniseHeadPose(t);
      const b = deniseHeadPose(t + DENISE_HEAD_LOOP);
      expect(b.angle).toBeCloseTo(a.angle, 9);
      expect(b.dx).toBeCloseTo(a.dx, 9);
      expect(b.dy).toBeCloseTo(a.dy, 9);
    }
  });

  it('moves gently and continuously', () => {
    let prev = deniseHeadPose(0);
    for (const t of samples.slice(1)) {
      const pose = deniseHeadPose(t);
      // Within a few degrees and a couple of design units of rest.
      expect(Math.abs(pose.angle)).toBeLessThanOrEqual((4 * Math.PI) / 180);
      expect(Math.abs(pose.dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(pose.dy)).toBeLessThanOrEqual(2);
      // No jumps between 10 ms samples.
      expect(Math.abs(pose.angle - prev.angle)).toBeLessThan(0.002);
      expect(Math.abs(pose.dy - prev.dy)).toBeLessThan(0.05);
      prev = pose;
    }
  });
});
