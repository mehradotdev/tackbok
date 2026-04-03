import type { TranslationFunction } from '~/lib/i18n/types';

// Controls which prompt sources are available when creating or editing an entry.
export type JournalPromptsMode = 'off' | 'all' | 'custom' | 'builtin';

export const JOURNAL_PROMPT_CATEGORIES = [
  { id: 'custom', labelKey: 'My Prompts', emoji: '💗', isCustom: true },
  { id: 'self', labelKey: 'Self', emoji: '😇', promptCount: 9, descriptionKey: 'focusArea_self_desc' },
  { id: 'littleThings', labelKey: 'Little things', emoji: '🌈', promptCount: 9, descriptionKey: 'focusArea_littleThings_desc' },
  { id: 'health', labelKey: 'Health', emoji: '💪', promptCount: 9, descriptionKey: 'focusArea_health_desc' },
  { id: 'family', labelKey: 'Family', emoji: '🏡', promptCount: 9, descriptionKey: 'focusArea_family_desc' },
  { id: 'friends', labelKey: 'Friends', emoji: '🤝', promptCount: 9, descriptionKey: 'focusArea_friends_desc' },
  { id: 'faith', labelKey: 'Faith', emoji: '🙏', promptCount: 9, descriptionKey: 'focusArea_faith_desc' },
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
  titleKey: string;
}

export const DEFAULT_JOURNAL_FOCUS_AREAS: BuiltInJournalPromptCategoryId[] = ['self', 'littleThings'];

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
      const index = idx + 1;
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
    pool = [...getBuiltInJournalPromptTitles(t, focusAreas), ...customPromptTitles];
  }

  return Array.from(new Set(pool));
}

export const DEFAULT_WORKSHEET_TEMPLATE_KEYS = [
  'What I am grateful for today...',
  'My affirmation for today...',
  'One little thing that made me smile recently...',
] as const;

export function buildDefaultWorksheetTemplate(t: TranslationFunction) {
  return DEFAULT_WORKSHEET_TEMPLATE_KEYS.map((key) => t(key)).join('\n...\n') + '\n...\n';
}
