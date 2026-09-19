import type { TranslationFunction, TranslationKey } from '~/lib/i18n/types';

// Controls which prompt sources are available when creating or editing an entry.
export type JournalPromptsMode = 'off' | 'all' | 'custom' | 'builtin';

export const JOURNAL_PROMPT_CATEGORIES = [
  { id: 'custom', labelKey: 'journaling.myPrompts', emoji: '💗', isCustom: true },
  {
    id: 'self',
    labelKey: 'entry.self',
    emoji: '😇',
    promptCount: 9,
    descriptionKey: 'journaling.focusareaSelfDesc',
  },
  {
    id: 'littleThings',
    labelKey: 'entry.littleThings',
    emoji: '🌈',
    promptCount: 9,
    descriptionKey: 'journaling.focusareaLittlethingsDesc',
  },
  {
    id: 'health',
    labelKey: 'entry.health',
    emoji: '💪',
    promptCount: 9,
    descriptionKey: 'journaling.focusareaHealthDesc',
  },
  {
    id: 'family',
    labelKey: 'entry.family',
    emoji: '🏡',
    promptCount: 9,
    descriptionKey: 'journaling.focusareaFamilyDesc',
  },
  {
    id: 'friends',
    labelKey: 'entry.friends',
    emoji: '🤝',
    promptCount: 9,
    descriptionKey: 'journaling.focusareaFriendsDesc',
  },
  {
    id: 'faith',
    labelKey: 'entry.faith',
    emoji: '🙏',
    promptCount: 9,
    descriptionKey: 'journaling.focusareaFaithDesc',
  },
] as const;

export type JournalPromptCategory = (typeof JOURNAL_PROMPT_CATEGORIES)[number];
export type JournalPromptCategoryId = JournalPromptCategory['id'];
export type BuiltInJournalPromptCategory = Exclude<
  JournalPromptCategory,
  { id: 'custom' }
>;
export type BuiltInJournalPromptCategoryId = Exclude<JournalPromptCategoryId, 'custom'>;

export interface BuiltInJournalPrompt {
  id: string;
  categoryId: BuiltInJournalPromptCategoryId;
  titleKey: TranslationKey;
}

export const DEFAULT_JOURNAL_FOCUS_AREAS: BuiltInJournalPromptCategoryId[] = [
  'self',
  'littleThings',
];

// Narrowed built-in categories list so consumers do not have to repeatedly exclude
// the special 'custom' category at every call site.
export const BUILT_IN_JOURNAL_PROMPT_CATEGORIES: BuiltInJournalPromptCategory[] =
  JOURNAL_PROMPT_CATEGORIES.filter(
    (category): category is BuiltInJournalPromptCategory => category.id !== 'custom',
  );

// Materialized list of built-in prompt translation keys derived from category metadata.
export const BUILT_IN_JOURNAL_PROMPTS: BuiltInJournalPrompt[] =
  BUILT_IN_JOURNAL_PROMPT_CATEGORIES.flatMap((category) => {
    const count = category.promptCount;
    return Array.from({ length: count }).map((_, idx) => {
      const index = (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      return {
        id: `prompt_${category.id}_${index}`,
        categoryId: category.id,
        titleKey: `prompt_${category.id}_${index}`,
      };
    });
  });

function usesBuiltInJournalPrompts(mode: JournalPromptsMode) {
  return mode === 'builtin' || mode === 'all';
}

function usesCustomJournalPrompts(mode: JournalPromptsMode) {
  return mode === 'custom' || mode === 'all';
}

// Translates the active built-in prompt subset for the currently selected focus areas.
export function getBuiltInJournalPromptTitles(
  t: TranslationFunction,
  focusAreas: readonly BuiltInJournalPromptCategoryId[],
) {
  return BUILT_IN_JOURNAL_PROMPTS.filter((prompt) =>
    focusAreas.includes(prompt.categoryId),
  ).map((prompt) => t(prompt.titleKey));
}

/**
 * Builds one deduplicated prompt pool from built-in and custom sources.
 *
 * This centralizes the selection rules so auto-fill and shuffle use the same logic.
 * If the selected source is empty, it falls back to the combined built-in + custom pool.
 */
export function getJournalPromptTitlePool({
  mode,
  focusAreas,
  customPromptTitles,
  t,
}: {
  mode: JournalPromptsMode;
  focusAreas: readonly BuiltInJournalPromptCategoryId[];
  customPromptTitles: readonly string[];
  t: TranslationFunction;
}) {
  let pool: string[] = [];

  if (usesBuiltInJournalPrompts(mode)) {
    pool.push(...getBuiltInJournalPromptTitles(t, focusAreas));
  }

  if (usesCustomJournalPrompts(mode)) {
    pool.push(...customPromptTitles);
  }

  if (pool.length === 0) {
    // Intentional: when the selected source is empty, manual prompt actions fall back
    // to built-in prompts so they still have something to draw from.
    pool = [...getBuiltInJournalPromptTitles(t, focusAreas)];
  }

  return Array.from(new Set(pool));
}

export const DEFAULT_WORKSHEET_TEMPLATE_KEYS = [
  'worksheet.whatIAmGratefulForToday',
  'worksheet.myAffirmationForToday',
  'worksheet.oneLittleThingThatMadeMeSmileRecently',
] as const;

export function buildDefaultWorksheetTemplate(t: TranslationFunction) {
  return DEFAULT_WORKSHEET_TEMPLATE_KEYS.map((key) => t(key)).join('\n...\n') + '\n...\n';
}
