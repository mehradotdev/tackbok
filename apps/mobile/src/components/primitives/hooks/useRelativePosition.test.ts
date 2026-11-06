import { I18nManager } from 'react-native';
import { useRelativePosition as calculateRelativePosition } from './useRelativePosition';

jest.mock('react-native', () => ({
  Dimensions: {
    get: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
  },
  I18nManager: { isRTL: false },
}));

function position(
  overrides: Partial<Parameters<typeof calculateRelativePosition>[0]> = {},
) {
  return calculateRelativePosition({
    align: 'start',
    side: 'bottom',
    alignOffset: 0,
    sideOffset: 4,
    avoidCollisions: true,
    triggerPosition: { pageX: 160, pageY: 100, width: 100, height: 40 },
    contentLayout: { x: 0, y: 0, width: 180, height: 200 },
    ...overrides,
  });
}

afterEach(() => {
  I18nManager.isRTL = false;
});

describe.each([false, true])('with RTL = %s', (isRTL) => {
  beforeEach(() => {
    I18nManager.isRTL = isRTL;
  });

  it.each([
    ['start', 160, 80],
    ['center', 120, 120],
    ['end', 80, 160],
  ] as const)(
    'anchors %s to the corresponding trigger edge without native mirroring',
    (align, ltrLeft, rtlLeft) => {
      const style = position({ align });

      // Explicit end in RTL and start in LTR both resolve to the physical left,
      // regardless of React Native's doLeftAndRightSwapInRTL setting.
      expect(style).toEqual({
        position: 'absolute',
        top: 144,
        [isRTL ? 'end' : 'start']: isRTL ? rtlLeft : ltrLeft,
        maxWidth: 400,
      });
    },
  );

  it.each([
    [24, 24, 16],
    [300, 208, 208],
  ])('clamps next to a trigger at x=%s near a screen edge', (pageX, ltrLeft, rtlLeft) => {
    expect(
      position({
        triggerPosition: { pageX, pageY: 100, width: 100, height: 40 },
        insets: { left: 16, right: 12 },
      }),
    ).toMatchObject({ [isRTL ? 'end' : 'start']: isRTL ? rtlLeft : ltrLeft });
  });

  it('constrains oversized content to the available screen width', () => {
    expect(
      position({
        contentLayout: { x: 0, y: 0, width: 500, height: 200 },
        insets: { left: 16, right: 12 },
      }),
    ).toMatchObject({ [isRTL ? 'end' : 'start']: 16, maxWidth: 372 });
  });

  it('preserves alignment and side offsets when collision avoidance is disabled', () => {
    expect(
      position({ alignOffset: 8, sideOffset: 12, avoidCollisions: false }),
    ).toMatchObject({
      [isRTL ? 'end' : 'start']: isRTL ? 88 : 168,
      top: 152,
    });
  });
});

it('hides unmeasured content and allows positioning to be disabled', () => {
  expect(position({ triggerPosition: null })).toMatchObject({ opacity: 0, top: 800 });
  expect(position({ contentLayout: null })).toMatchObject({ opacity: 0, top: 800 });
  expect(position({ disablePositioningStyle: true })).toEqual({});
});
