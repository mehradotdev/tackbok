# Mobile localization

This guide applies to `apps/mobile`. English is the source language; current
catalogs are English, Arabic, German, Hebrew, Simplified Chinese, and Traditional
Chinese. New languages are a separate follow-up to this migration.

## Voice and meaning

Write for adults without specialist knowledge. Be friendly, concise, and
respectful. Avoid slang, forced enthusiasm, judgment about journaling habits,
and technical implementation details unless they help someone decide what to do.
Use clear actions: “Keep editing” and “Discard changes” distinguish unsaved work
from deleting a saved entry. Preserve security promises, destructive-action scope,
and recovery instructions when simplifying backup copy.

Use English sentence case for headings and controls. Preserve proper names,
acronyms, punctuation within sentences, and the spelling of third-party products.
Use a single ellipsis character where needed. Use “tap” for touch interactions.

Translate meaning rather than word order. Adapt idioms naturally; preserve the
emotional purpose of prompts and explicit references to God, prayer, grace, or
faith. Do not silently secularize or narrow a prompt's meaning.

Prefer natural gender-neutral wording. If it sounds unnatural, masculine forms
are the agreed fallback. This applies both to app instructions and text speaking
as the user, such as shared gratitude cards. Do not infer gender from names or
collect a gender preference for localization.

## Register and regional variants

| Catalog             | Address and conventions                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| English             | Everyday, respectful “you”; sentence case                                                                                     |
| German              | Informal singular `du/dein`; normal German noun capitalization                                                                |
| Arabic              | Modern Standard Arabic, broadly understood vocabulary; natural neutral constructions where possible, masculine when necessary |
| Hebrew              | Everyday singular address; natural infinitive/noun action labels where appropriate, masculine when necessary                  |
| Simplified Chinese  | Everyday respectful `你` or natural pronoun omission; Simplified script                                                       |
| Traditional Chinese | Everyday respectful `你` or natural pronoun omission; Traditional script; retain established catalog vocabulary               |

These are this app's editorial choices, not claims that every speaker prefers the
same register. Research established product-writing conventions before adding a
language. Prefer words understood across regions, including for a future Spanish
catalog. If materially different regional meanings cannot be reconciled naturally,
ask the developer which variant to prioritize. Keep Simplified and Traditional
Chinese distinct; a script conversion alone is not a translation review.

Use recognizable transliterations of Tackbok where appropriate in other scripts.
Keep “Tackbok” in Latin-script languages, including German, French, and Spanish.
Do not translate it literally or invent a new product name. Keep Google Drive,
GitHub, and other third-party names recognizable.

## Glossary

| Meaning                     | English    | German        | Arabic        | Hebrew      | Simplified Chinese | Traditional Chinese |
| --------------------------- | ---------- | ------------- | ------------- | ----------- | ------------------ | ------------------- |
| Individual journal record   | entry      | Eintrag       | سجل           | רשומה       | 条目               | 紀錄                |
| Collection of entries       | journal    | Tagebuch      | دفتر اليوميات | יומן        | 日记               | 日記                |
| Audio attachment            | voice note | Sprachnotiz   | ملاحظة صوتية  | הקלטה קולית | 语音笔记           | 語音筆記            |
| Writing question/suggestion | prompt     | Schreibimpuls | سؤال          | הנחיה       | 提示               | 提示                |
| Organizing label            | tag        | Tag           | وسم           | תגית        | 标签               | 標籤                |

Inflect terms naturally; consistency does not mean pasting the same grammatical
form into every sentence. Existing stored user content, example entries, and
custom prompts are not rewritten when the language changes.

## Message structure

Source messages live in `apps/mobile/src/lib/i18n/translations/en.ts`. Use stable
identifiers such as `entry.discardChanges.message`; never rename an identifier
just because its English wording changed. Existing `prompt_*` and `sample_*`
identifiers are already stable and remain supported. Use `TranslationKey` and
`TranslationFunction` for metadata and helper signatures. Do not widen keys to
`string` or cast arbitrary strings merely to suppress compiler errors.

Use separate identifiers when identical English words have different meanings or
need different grammatical roles. Keep labels and user-authored values distinct.
Translate complete sentences so translators can reorder names, counts, and nouns.
For example, translate the entire milestone message, not a number followed by
“days of gratitude.” Context-dependent nouns should be separate labels or part of
separate complete messages rather than grammatical sentence fragments.

The existing `useTranslation` hook wraps a bundled, synchronous i18next instance.
It does not download translations. React Native renders plain text, so HTML
escaping is disabled. Interpolated user text is not parsed as another template.

```ts
t('milestone.daysOfGratitude', { count: days });
t('greeting.withName', { greeting: t('greeting.welcomeBack'), name });
```

Pass numeric counts, not preformatted strings. The translator selects the plural
form first and formats numbers for display afterward. `translations/plurals.ts`
contains complete messages with standard `_one`, `_two`, `_few`, `_many`, `_zero`,
and `_other` suffixes as required by `Intl.PluralRules` for each language. Singular
or dual forms may spell out the count naturally; other parameters must remain.
Keep the base catalog message meaningful as well as its plural variants.

Preserve named placeholders, including their spelling. Add a short source comment
when a message's audience, trigger, context, or grammatical role is unclear.
Missing localized messages fall back to the English source. An unexpected unknown
identifier displays the generic English error instead of exposing an internal key.

## Locale and formatting

Language selection uses the first supported device language unless the user has
selected one explicitly. Chinese script subtags take precedence over region;
Hong Kong/Macau without explicit script use the Traditional catalog. Persisted
locale identifiers remain `zh-CN` and `zh-TW` for compatibility. Internally,
i18next and Intl use `zh-Hans` and `zh-Hant`, which native Android supports
more reliably than region-only Chinese tags.

Use the shared date/time/number helpers for display. App language controls words;
device region informs formatting, and device clock preference controls 12/24-hour
display. Use the formatting locale's default digits without an explicit numbering
system override. If native Intl does not support a combined language/region
tag, fall back to the app language rather than the device language. Respect existing first-weekday and weekday-display
settings. Journal dates and the date picker retain their Gregorian date model;
this change does not introduce a new calendar system. Date-only journal values
represent local dates rather than UTC midnight.

Never localize stored `HH:mm` reminder values, timestamps, database IDs, filenames
required by archive formats, or serialization keys. Keep user names, journal text,
and custom prompts as written. Locale formatting is a display concern.

## Verification and releases

From `apps/mobile`:

```sh
bun x tsc --noEmit
bun x jest src/lib/i18n src/screens/home/greeting.test.ts src/screens/home/header-greeting.test.ts --runInBand --no-watchman
```

Check all catalogs for missing/extra keys, placeholders, glossary/register drift,
and required plural categories. Exercise zero, one, two, few, many, and large
counts, English fallback, Chinese locale matching, and device formatting preferences.
Run tests for changed call sites as well. Inspect longer German strings, Arabic
and Hebrew RTL, Chinese text, large font sizes, action labels, and accessibility
announcements on a device or simulator. Do not claim visual verification if it
was unavailable.

Fluent-speaker review is welcome but not a release gate. AI-assisted translations
may ship after automated and practical checks. Fix reported linguistic issues in
later updates; completeness checks do not certify linguistic quality.

Implementation references: [i18next plurals](https://www.i18next.com/translation-function/plurals),
[i18next interpolation](https://www.i18next.com/translation-function/interpolation),
and [Expo localization](https://docs.expo.dev/versions/latest/sdk/localization/).
