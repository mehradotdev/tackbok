import {
  BUBBLE_GAP,
  HOLE_PADDING,
  MIN_BUBBLE_HEIGHT,
  placeCoachMark,
} from './coachMarkLayout';

const OVERLAY = { x: 0, y: 0, width: 400, height: 800 };

test('a target low on the screen gets the bubble above it', () => {
  const place = placeCoachMark({ x: 340, y: 600, width: 52, height: 150 }, OVERLAY)!;
  expect(place.above).toBe(true);
  expect(place.bubbleBottom).toBe(800 - (600 - HOLE_PADDING) + BUBBLE_GAP);
  expect(place.bubbleTop).toBeUndefined();
  expect(place.onRightHalf).toBe(true);
});

test('a target high on the screen gets the bubble below it', () => {
  const place = placeCoachMark({ x: 16, y: 60, width: 40, height: 40 }, OVERLAY)!;
  expect(place.above).toBe(false);
  expect(place.bubbleTop).toBe(60 + 40 + HOLE_PADDING + BUBBLE_GAP);
  expect(place.onRightHalf).toBe(false);
});

test('the bubble stays on screen and its pointer stays on the bubble', () => {
  for (const x of [0, 180, 380]) {
    const place = placeCoachMark({ x, y: 300, width: 20, height: 20 }, OVERLAY)!;
    expect(place.bubbleLeft).toBeGreaterThanOrEqual(12);
    expect(place.bubbleLeft + place.bubbleWidth).toBeLessThanOrEqual(400 - 12);
    expect(place.arrowLeft).toBeGreaterThan(0);
    expect(place.arrowLeft).toBeLessThan(place.bubbleWidth);
  }
});

test('the pointer aims at the target centre when it can', () => {
  const place = placeCoachMark({ x: 190, y: 300, width: 20, height: 20 }, OVERLAY)!;
  const arrowCentre = place.bubbleLeft + place.arrowLeft + 6;
  expect(arrowCentre).toBeCloseTo(200);
});

test('measurements are taken relative to the overlay', () => {
  const place = placeCoachMark(
    { x: 100, y: 150, width: 40, height: 40 },
    { x: 0, y: 50, width: 400, height: 750 },
  )!;
  expect(place.hole).toEqual({
    x: 100 - HOLE_PADDING,
    y: 100 - HOLE_PADDING,
    width: 40 + 2 * HOLE_PADDING,
    height: 40 + 2 * HOLE_PADDING,
  });
});

test('a target off screen has no placement', () => {
  expect(placeCoachMark({ x: 100, y: 900, width: 40, height: 40 }, OVERLAY)).toBeNull();
  expect(placeCoachMark({ x: -200, y: 100, width: 40, height: 40 }, OVERLAY)).toBeNull();
});

test('the bubble goes on the side with more room, capped to that room', () => {
  // A tall target (an expanded day at large text) with little room above it.
  const above = placeCoachMark({ x: 20, y: 150, width: 300, height: 520 }, OVERLAY)!;
  expect(above.above).toBe(true);
  expect(above.bubbleMaxHeight).toBe(150 - HOLE_PADDING - BUBBLE_GAP - 12);

  const below = placeCoachMark({ x: 20, y: 120, width: 300, height: 500 }, OVERLAY)!;
  expect(below.above).toBe(false);
  expect(below.bubbleMaxHeight).toBe(800 - (620 + HOLE_PADDING) - BUBBLE_GAP - 12);
});

test('a target that leaves no room for a bubble uses the fallback', () => {
  const room = (height: number) =>
    placeCoachMark({ x: 20, y: 60, width: 300, height }, OVERLAY);
  expect(room(500)).not.toBeNull();
  expect(room(800 - 60 - 2 * (MIN_BUBBLE_HEIGHT / 2))).toBeNull();
});
