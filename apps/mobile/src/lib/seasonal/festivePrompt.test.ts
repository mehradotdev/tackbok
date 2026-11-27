import {
  festivePromptFor,
  festiveSwitchFrom,
  type FestiveLook,
  type FestiveSwitch,
} from './festivePrompt';

const day = (year: number, month: number, date: number, hour = 12) =>
  new Date(year, month - 1, date, hour);

const usual: FestiveLook = {
  festiveTouchesEnabled: true,
  festivePromptSeason: null,
  festiveSwitch: null,
  theme: 'ocean',
  icon: 'Sage',
};

function suggestOn(now: Date) {
  const prompt = festivePromptFor(now, usual);
  if (prompt?.kind !== 'suggest') throw new Error('expected a suggestion');
  return prompt;
}

describe('festivePromptFor: the suggestion', () => {
  it('runs from 1 to 26 Dec only', () => {
    expect(festivePromptFor(day(2026, 11, 30), usual)).toBeNull();
    expect(suggestOn(day(2026, 12, 1)).season).toBe('winter-holidays-2026');
    expect(suggestOn(day(2026, 12, 26, 23)).suggestion.icon).toBe('Christmas');
    expect(festivePromptFor(day(2026, 12, 27), usual)).toBeNull();
    expect(festivePromptFor(day(2027, 1, 3), usual)).toBeNull();
  });

  it('shows once per season', () => {
    const shown = { ...usual, festivePromptSeason: 'winter-holidays-2026' };
    expect(festivePromptFor(day(2026, 12, 10), shown)).toBeNull();
    expect(suggestOn(day(2027, 12, 10)).season).toBe('winter-holidays-2027');
    expect(festivePromptFor(day(2027, 12, 10), shown)?.kind).toBe('suggest');
  });

  it('respects "Festive touches" and an already festive look', () => {
    const now = day(2026, 12, 10);
    expect(festivePromptFor(now, { ...usual, festiveTouchesEnabled: false })).toBeNull();
    expect(festivePromptFor(now, { ...usual, theme: 'new-year' })).toBeNull();
    expect(festivePromptFor(now, { ...usual, icon: 'Christmas' })).toBeNull();
  });
});

describe('festivePromptFor: the switch-back', () => {
  const tookALook: FestiveSwitch = festiveSwitchFrom(
    day(2026, 12, 10),
    suggestOn(day(2026, 12, 10)),
    usual,
  );
  const festive = (look: Partial<FestiveLook>): FestiveLook => ({
    ...usual,
    festivePromptSeason: 'winter-holidays-2026',
    festiveSwitch: tookALook,
    ...look,
  });

  it('remembers the look and offers from 2 Jan local time', () => {
    expect(tookALook).toEqual({
      season: 'winter-holidays-2026',
      theme: 'ocean',
      icon: 'Sage',
      offerFrom: new Date(2027, 0, 2).getTime(),
    });
    const both = festive({ theme: 'christmas', icon: 'Christmas' });
    expect(festivePromptFor(day(2027, 1, 1, 23), both)).toBeNull();
    expect(festivePromptFor(day(2027, 1, 2, 0), both)).toEqual({
      kind: 'switchBack',
      theme: 'ocean',
      icon: 'Sage',
    });
  });

  it('restores only what is still festive, even after the window', () => {
    expect(festivePromptFor(day(2027, 2, 14), festive({ icon: 'Christmas' }))).toEqual({
      kind: 'switchBack',
      theme: null,
      icon: 'Sage',
    });
    expect(festivePromptFor(day(2027, 1, 4), festive({ theme: 'new-year' }))).toEqual({
      kind: 'switchBack',
      theme: 'ocean',
      icon: null,
    });
  });

  it('forgets the switch when the festive look is already gone', () => {
    expect(festivePromptFor(day(2027, 1, 4), festive({}))).toEqual({ kind: 'forget' });
    expect(festivePromptFor(day(2027, 1, 4), festive({ theme: 'slate' }))).toEqual({
      kind: 'forget',
    });
  });

  it('forgets it once the next season begins', () => {
    const still = festive({ icon: 'Christmas' });
    expect(festivePromptFor(day(2027, 11, 30), still)?.kind).toBe('switchBack');
    expect(festivePromptFor(day(2027, 12, 1), still)).toEqual({ kind: 'forget' });
  });

  it('stays quiet while "Festive touches" is off', () => {
    const off = festive({ icon: 'Christmas', festiveTouchesEnabled: false });
    expect(festivePromptFor(day(2027, 1, 4), off)).toBeNull();
  });
});
