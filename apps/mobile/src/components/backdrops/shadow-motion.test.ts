import { shadowPose } from './shadow-motion';

it('looks at the viewer before moving its head, then returns to rest', () => {
  expect(shadowPose(0.3, 0, 0).gaze).toBe(1);
  expect(shadowPose(0.49, 0, 0).turn).toBe(0);
  expect(shadowPose(1.4, 0, 0).turn).toBe(1);
  const end = shadowPose(4, 0, 0);
  expect(end.gaze).toBe(0);
  expect(end.turn).toBe(0);
  expect(end.mouth).toBe(0);
});
it('keeps idle silent and reduced motion completely still', () => {
  for (let t = 0; t <= 24; t += 0.1) expect(shadowPose(0, 1, t).mouth).toBe(0);
  expect(shadowPose(-1, 1, 12)).toEqual({
    gaze: 1,
    turn: 1,
    tilt: -0.045,
    blink: 0,
    mouth: 0,
    tail: 0,
    ear: 0,
  });
  expect(shadowPose(0, 0, 24).tail).toBeCloseTo(shadowPose(0, 0, 0).tail);
});
it('separates the knowing glance from the meow and blinks after the meow', () => {
  expect(shadowPose(1.95, 1, 0).mouth).toBeCloseTo(1);
  expect(shadowPose(1.95, 0, 0).mouth).toBe(0);
  expect(shadowPose(2.45, 0, 0).blink).toBeCloseTo(1);
  expect(shadowPose(2.75, 1, 0).blink).toBeCloseTo(1);
  expect(shadowPose(2.75, 1, 0).mouth).toBe(0);
});


it('gives the near ear a quick outward flick and recovery, with visible tail travel', () => {
  expect(shadowPose(0, 0, 3.34).ear).toBeCloseTo(-0.25);
  expect(shadowPose(0, 0, 3.63).ear).toBeCloseTo(0.13);
  expect(shadowPose(0, 0, 4).ear).toBe(0);
  expect(shadowPose(0, 0, 2).tail).toBeCloseTo(0.75);
  expect(shadowPose(0, 0, 6).tail).toBeCloseTo(-0.75);
});
