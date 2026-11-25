import type { TargetRect } from './coachMarkTargets';

/** Space between the target and the highlight ring around it. */
export const HOLE_PADDING = 6;
/** Gap between the highlight and the bubble; the pointer sits in it. */
export const BUBBLE_GAP = 14;
const EDGE_MARGIN = 12;
const MAX_BUBBLE_WIDTH = 260;
const ARROW_SIZE = 12;
/** Below this much room on either side, use the fixed fallback instead. */
export const MIN_BUBBLE_HEIGHT = 96;

export interface CoachMarkPlacement {
  /** The highlighted hole, in overlay coordinates. */
  hole: TargetRect;
  bubbleWidth: number;
  bubbleLeft: number;
  /** The bubble sits above the hole (`bottom` set) or below it (`top` set). */
  above: boolean;
  bubbleTop?: number;
  bubbleBottom?: number;
  /** The room on the bubble's side; taller content scrolls. */
  bubbleMaxHeight: number;
  /** Pointer position from the bubble's left edge. */
  arrowLeft: number;
  /** The target sits in the right half (the dock in LTR, the left in RTL). */
  onRightHalf: boolean;
}

/**
 * Places a coach-mark bubble next to a target, on whichever side has more
 * room, capped to that room and kept inside the overlay, with a pointer aimed
 * at the target's centre. Returns null when the target is not on screen or
 * leaves no room for a bubble, so the caller falls back to a fixed position.
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
  const roomAbove = hole.y - BUBBLE_GAP - EDGE_MARGIN;
  const roomBelow = overlay.height - (hole.y + hole.height) - BUBBLE_GAP - EDGE_MARGIN;
  const above = roomAbove > roomBelow;
  const bubbleMaxHeight = Math.max(roomAbove, roomBelow);
  if (bubbleMaxHeight < MIN_BUBBLE_HEIGHT) return null;
  const onRightHalf = centreX > overlay.width / 2;
  return above
    ? {
        hole,
        bubbleWidth,
        bubbleLeft,
        above,
        bubbleBottom: overlay.height - hole.y + BUBBLE_GAP,
        bubbleMaxHeight,
        arrowLeft,
        onRightHalf,
      }
    : {
        hole,
        bubbleWidth,
        bubbleLeft,
        above,
        bubbleTop: hole.y + hole.height + BUBBLE_GAP,
        bubbleMaxHeight,
        arrowLeft,
        onRightHalf,
      };
}
