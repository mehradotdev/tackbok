export const SHARE_OUTPUTS = {
  square: { id: 'square', label: '1:1', width: 1080, height: 1080, aspectRatio: 1 },
  portrait: {
    id: 'portrait',
    label: '4:5',
    width: 1080,
    height: 1350,
    aspectRatio: 4 / 5,
  },
  tall: { id: 'tall', label: '2:3', width: 1080, height: 1620, aspectRatio: 2 / 3 },
} as const;

export type ShareOutputId = keyof typeof SHARE_OUTPUTS;
export type ShareOutput = (typeof SHARE_OUTPUTS)[ShareOutputId];

export const ACHIEVEMENT_SHARE_OUTPUT = SHARE_OUTPUTS.portrait;

export type EntryLayoutCandidate = {
  outputId: ShareOutputId;
  titleSize: number;
  bodySize: number;
  dateSize: number;
  lineHeight: number;
  /** Vertical gap between the card's content rows at this text size. */
  contentGap: number;
  finalFallback?: boolean;
};

export const ENTRY_LAYOUT_CANDIDATES: readonly EntryLayoutCandidate[] = [
  {
    outputId: 'square',
    titleSize: 25,
    bodySize: 20,
    dateSize: 18,
    lineHeight: 28,
    contentGap: 12,
  },
  {
    outputId: 'square',
    titleSize: 22,
    bodySize: 17,
    dateSize: 17,
    lineHeight: 24,
    contentGap: 12,
  },
  {
    outputId: 'portrait',
    titleSize: 25,
    bodySize: 20,
    dateSize: 18,
    lineHeight: 28,
    contentGap: 12,
  },
  {
    outputId: 'portrait',
    titleSize: 22,
    bodySize: 17,
    dateSize: 17,
    lineHeight: 24,
    contentGap: 12,
  },
  {
    outputId: 'portrait',
    titleSize: 19,
    bodySize: 15,
    dateSize: 16,
    lineHeight: 21,
    contentGap: 9,
  },
  {
    outputId: 'tall',
    titleSize: 25,
    bodySize: 20,
    dateSize: 18,
    lineHeight: 28,
    contentGap: 12,
  },
  {
    outputId: 'tall',
    titleSize: 22,
    bodySize: 17,
    dateSize: 17,
    lineHeight: 24,
    contentGap: 12,
  },
  {
    outputId: 'tall',
    titleSize: 19,
    bodySize: 15,
    dateSize: 16,
    lineHeight: 21,
    contentGap: 9,
  },
  {
    outputId: 'tall',
    titleSize: 17,
    bodySize: 13,
    dateSize: 15,
    lineHeight: 18,
    contentGap: 9,
    finalFallback: true,
  },
] as const;

/**
 * Body line caps used only by the final fallback candidate, where tail ellipsis
 * replaces further shrinking. Optional regions consume vertical space, so the
 * body keeps fewer lines whenever they are included.
 */
export const FINAL_BODY_LINE_LIMITS = {
  withPhotos: 10,
  withMood: 14,
  textOnly: 16,
} as const;

export function getFinalBodyLineLimit(options: {
  includeMood: boolean;
  includePhotos: boolean;
}): number {
  if (options.includePhotos) return FINAL_BODY_LINE_LIMITS.withPhotos;
  if (options.includeMood) return FINAL_BODY_LINE_LIMITS.withMood;
  return FINAL_BODY_LINE_LIMITS.textOnly;
}
