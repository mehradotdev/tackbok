import { getCenteredTitleInset } from './header-layout';

describe('getCenteredTitleInset', () => {
  it('returns 0 until both buttons are measured', () => {
    expect(getCenteredTitleInset({ x: 0, width: 0 }, { x: 300, width: 70 })).toBe(0);
    expect(getCenteredTitleInset({ x: 16, width: 62 }, { x: 0, width: 0 })).toBe(0);
  });

  it('insets both sides by the padding plus the wider button and a gap', () => {
    // LTR: Cancel on the left at the 16 px padding, Save on the right.
    expect(getCenteredTitleInset({ x: 16, width: 62 }, { x: 316, width: 70 })).toBe(
      16 + 70 + 8,
    );
  });

  it('gives the same inset in RTL, where the buttons swap sides', () => {
    expect(getCenteredTitleInset({ x: 324, width: 62 }, { x: 16, width: 70 })).toBe(
      16 + 70 + 8,
    );
  });
});
