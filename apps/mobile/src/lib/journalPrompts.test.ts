import {
  DEFAULT_JOURNAL_FOCUS_AREAS,
  BUILT_IN_JOURNAL_PROMPT_CATEGORIES,
} from './journalPrompts';

test('new installs start with enough focus areas to continue onboarding', () => {
  // The focus-areas step asks for at least three (FocusAreasScreen).
  expect(new Set(DEFAULT_JOURNAL_FOCUS_AREAS).size).toBeGreaterThanOrEqual(3);
  const categoryIds = BUILT_IN_JOURNAL_PROMPT_CATEGORIES.map((category) => category.id);
  for (const area of DEFAULT_JOURNAL_FOCUS_AREAS) expect(categoryIds).toContain(area);
});
