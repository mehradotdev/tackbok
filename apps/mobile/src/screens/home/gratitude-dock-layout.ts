/** 52px buttons, 12px gaps and 32px total vertical padding. */
export function gratitudeDockHeight(hasPetAction: boolean) {
  return hasPetAction ? 212 : 148;
}

/** Positions are stored as the equivalent two-button dock's top offset. */
export function gratitudeDockPositionBounds(
  containerHeight: number,
  panelHeight: number,
  verticalPadding: number,
  bottomInset: number,
) {
  const baseHeight = gratitudeDockHeight(false);
  const heightDelta = panelHeight - baseHeight;
  const minY = verticalPadding + heightDelta;
  const maxY = Math.max(
    minY,
    containerHeight - bottomInset - baseHeight - verticalPadding,
  );
  return {
    heightDelta,
    minY,
    maxY,
    defaultY: Math.min(maxY, Math.max(minY, Math.round(containerHeight * 0.7))),
  };
}
