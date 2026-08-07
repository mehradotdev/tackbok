import {
  getAchievement,
  getAchievementForCreateTransition,
  isAchievementDay,
} from './achievements';

describe('achievement rules', () => {
  test.each([1, 5, 10, 25, 50, 75])('recognizes %i as an achievement', (day) => {
    expect(isAchievementDay(day)).toBe(true);
    expect(getAchievement(day)).toEqual({
      id: `journal-days-${day}`,
      journaledDays: day,
      variant: day === 1 ? 'first-day' : 'days',
    });
  });

  test.each([-25, -1, 0, 2, 4, 6, 9, 11, 24, 26, 1.5])(
    'rejects %s as an achievement',
    (day) => {
      expect(isAchievementDay(day)).toBe(false);
      expect(getAchievement(day)).toBeNull();
    },
  );

  test('day one requires an empty database', () => {
    expect(
      getAchievementForCreateTransition({
        entryCountBefore: 0,
        journaledDaysBefore: 0,
        addsJournaledDay: true,
      }),
    ).toEqual(getAchievement(1));

    expect(
      getAchievementForCreateTransition({
        entryCountBefore: 4,
        journaledDaysBefore: 3,
        addsJournaledDay: true,
      }),
    ).toBeNull();
  });

  test('only a newly added distinct day can earn later thresholds', () => {
    expect(
      getAchievementForCreateTransition({
        entryCountBefore: 7,
        journaledDaysBefore: 4,
        addsJournaledDay: false,
      }),
    ).toBeNull();
    expect(
      getAchievementForCreateTransition({
        entryCountBefore: 7,
        journaledDaysBefore: 4,
        addsJournaledDay: true,
      }),
    ).toEqual(getAchievement(5));
  });

  test('a recreated threshold is eligible from the live count', () => {
    expect(
      getAchievementForCreateTransition({
        entryCountBefore: 30,
        journaledDaysBefore: 24,
        addsJournaledDay: true,
      }),
    ).toEqual(getAchievement(25));
  });
});

