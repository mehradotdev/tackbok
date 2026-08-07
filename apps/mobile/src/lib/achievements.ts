export type Achievement = {
  id: `journal-days-${number}`;
  journaledDays: number;
  variant: 'first-day' | 'days';
};

export function isAchievementDay(dayCount: number): boolean {
  return (
    Number.isInteger(dayCount) &&
    dayCount > 0 &&
    (dayCount === 1 || dayCount === 5 || dayCount === 10 || dayCount % 25 === 0)
  );
}

export function getAchievement(dayCount: number): Achievement | null {
  if (!isAchievementDay(dayCount)) return null;

  return {
    id: `journal-days-${dayCount}`,
    journaledDays: dayCount,
    variant: dayCount === 1 ? 'first-day' : 'days',
  };
}

export function getAchievementForCreateTransition({
  entryCountBefore,
  journaledDaysBefore,
  addsJournaledDay,
}: {
  entryCountBefore: number;
  journaledDaysBefore: number;
  addsJournaledDay: boolean;
}): Achievement | null {
  if (entryCountBefore === 0) return getAchievement(1);
  if (!addsJournaledDay) return null;
  return getAchievement(journaledDaysBefore + 1);
}
