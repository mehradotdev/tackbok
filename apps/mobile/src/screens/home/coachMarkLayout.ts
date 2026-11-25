import type { TargetRect } from './coachMarkTargets';

/** Space between the target and the highlight ring around it. */
export const HOLE_PADDING = 6;
/** Gap between the highlight and the bubble; the pointer sits in it. */
export const BUBBLE_GAP = 14;
const EDGE_MARGIN = 12;
const MAX_BUBBLE_WIDTH = 260;
const ARROW_SIZE = 12;

export interface CoachMarkPlacement {
  /** The highlighted hole, in overlay coordinates. */
  hole: TargetRect;
  bubbleWidth: number;
  bubbleLeft: number;
  /** The bubble sits above the hole (`bottom` set) or below it (`top` set). */
  above: boolean;
  bubbleTop?: number;
  bubbleBottom?: number;
  /** Pointer position from the bubble's left edge. */
  arrowLeft: number;
  /** The target sits in the right half (the dock in LTR, the left in RTL). */
  onRightHalf: boolean;
}

/**
 * Places a coach-mark bubble next to a target. Targets in the lower half get
 * the bubble above them, others below; it stays inside the overlay with a
 * pointer aimed at the target's centre. Returns null when the target is not
 * on screen, so the caller falls back to a fixed position.
 */
export function placeCoachMark(
  target: TargetRect,
  overlay: TargetRect,
): CoachMarkPlacement | null {
  const hole = {
    x: target.x - overlay.x - HOLE_PADDING,
    y: target.y - overlay.y - HOLE_PADDING,
    width: target.width + 2 * HOLE_PADDING,
    height: target.height + 2 * HOLE_PADDING,
  };
  const centreX = hole.x + hole.width / 2;
  const centreY = hole.y + hole.height / 2;
  if (centreX < 0 || centreX > overlay.width || centreY < 0 || centreY > overlay.height) {
    return null;
  }

  const bubbleWidth = Math.min(MAX_BUBBLE_WIDTH, overlay.width - 2 * EDGE_MARGIN);
  const bubbleLeft = Math.min(
    Math.max(centreX - bubbleWidth / 2, EDGE_MARGIN),
    overlay.width - bubbleWidth - EDGE_MARGIN,
  );
  const arrowLeft = Math.min(
    Math.max(centreX - bubbleLeft - ARROW_SIZE / 2, ARROW_SIZE),
    bubbleWidth - 2 * ARROW_SIZE,
  );
  const above = centreY > overlay.height / 2;
  const onRightHalf = centreX > overlay.width / 2;
  return above
    ? {
        hole,
        bubbleWidth,
        bubbleLeft,
        above,
        bubbleBottom: overlay.height - hole.y + BUBBLE_GAP,
        arrowLeft,
        onRightHalf,
      }
    : {
        hole,
        bubbleWidth,
        bubbleLeft,
        above,
        bubbleTop: hole.y + hole.height + BUBBLE_GAP,
        arrowLeft,
        onRightHalf,
      };
}
