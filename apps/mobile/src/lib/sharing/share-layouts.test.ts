import {
  ACHIEVEMENT_SHARE_OUTPUT,
  ENTRY_LAYOUT_CANDIDATES,
  FINAL_BODY_LINE_LIMITS,
  getFinalBodyLineLimit,
  SHARE_OUTPUTS,
} from './share-layouts';

describe('entry share layouts', () => {
  test('progresses through fixed square, portrait, and tall candidates', () => {
    expect(ENTRY_LAYOUT_CANDIDATES.map((candidate) => candidate.outputId)).toEqual([
      'square',
      'square',
      'portrait',
      'portrait',
      'portrait',
      'tall',
      'tall',
      'tall',
      'tall',
    ]);
    expect(ENTRY_LAYOUT_CANDIDATES.at(-1)?.finalFallback).toBe(true);
  });

  test('exports exact standard dimensions', () => {
    expect(SHARE_OUTPUTS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(SHARE_OUTPUTS.portrait).toMatchObject({ width: 1080, height: 1350 });
    expect(SHARE_OUTPUTS.tall).toMatchObject({
      width: 1080,
      height: 1620,
      aspectRatio: 2 / 3,
    });
  });

  test('never grows text or spacing while stepping through candidates', () => {
    ENTRY_LAYOUT_CANDIDATES.forEach((candidate, index) => {
      const previous = ENTRY_LAYOUT_CANDIDATES[index - 1];
      if (!previous || previous.outputId !== candidate.outputId) return;
      expect(candidate.titleSize).toBeLessThan(previous.titleSize);
      expect(candidate.bodySize).toBeLessThan(previous.bodySize);
      expect(candidate.contentGap).toBeLessThanOrEqual(previous.contentGap);
    });
  });

  test('reserves fewer body lines for the fallback as optional content is added', () => {
    expect(getFinalBodyLineLimit({ includeMood: false, includePhotos: false })).toBe(
      FINAL_BODY_LINE_LIMITS.textOnly,
    );
    expect(getFinalBodyLineLimit({ includeMood: true, includePhotos: false })).toBe(
      FINAL_BODY_LINE_LIMITS.withMood,
    );
    expect(getFinalBodyLineLimit({ includeMood: false, includePhotos: true })).toBe(
      FINAL_BODY_LINE_LIMITS.withPhotos,
    );
    // Photos are the taller region, so they win when both are included.
    expect(getFinalBodyLineLimit({ includeMood: true, includePhotos: true })).toBe(
      FINAL_BODY_LINE_LIMITS.withPhotos,
    );
    expect(FINAL_BODY_LINE_LIMITS.withPhotos).toBeLessThan(
      FINAL_BODY_LINE_LIMITS.withMood,
    );
    expect(FINAL_BODY_LINE_LIMITS.withMood).toBeLessThan(FINAL_BODY_LINE_LIMITS.textOnly);
  });

  test('uses the 4:5 portrait preset for achievements', () => {
    expect(ACHIEVEMENT_SHARE_OUTPUT).toBe(SHARE_OUTPUTS.portrait);
    expect(ACHIEVEMENT_SHARE_OUTPUT).toMatchObject({
      width: 1080,
      height: 1350,
      aspectRatio: 4 / 5,
    });
  });
});
