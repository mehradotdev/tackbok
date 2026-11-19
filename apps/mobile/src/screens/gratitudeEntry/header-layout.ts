interface IHorizontalFrame {
  x: number;
  width: number;
}

/** Space kept between the centred title and the nearest header button. */
const TITLE_BUTTON_GAP = 8;

/**
 * Equal left and right insets for a title centred between two header buttons.
 * Insetting both sides by the wider button keeps the title centred on screen and
 * clear of both buttons, whichever side each one is on (LTR or RTL).
 * Returns 0 until both buttons are measured, which matches the full-width layout.
 */
export function getCenteredTitleInset(a: IHorizontalFrame, b: IHorizontalFrame): number {
  if (a.width === 0 || b.width === 0) return 0;
  // The button nearer the left edge starts at the header's horizontal padding.
  const edgePadding = Math.min(a.x, b.x);
  return edgePadding + Math.max(a.width, b.width) + TITLE_BUTTON_GAP;
}
