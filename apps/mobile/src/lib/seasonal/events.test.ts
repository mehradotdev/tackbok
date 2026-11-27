import { en } from '~/lib/i18n/translations/en';
import {
  activeSeasonalEvent,
  SEASONAL_EVENTS,
  seasonalDay,
  seasonKey,
  type SeasonalEvent,
} from './events';

const local = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);

describe('seasonal events', () => {
  it.each([
    [local(2026, 11, 30, 23), null],
    [local(2026, 12, 1, 0), 'winter-holidays'],
    [local(2026, 12, 31, 23), 'winter-holidays'],
    [local(2027, 1, 6, 23), 'winter-holidays'],
    [local(2027, 1, 7, 0), null],
    [local(2027, 7, 1), null],
  ])('uses the local date for the window: %s', (date, expected) => {
    expect(activeSeasonalEvent(date)?.id ?? null).toBe(expected);
  });

  it('greets only on the four special days', () => {
    expect(seasonalDay(local(2026, 12, 23))).toBeNull();
    expect(seasonalDay(local(2026, 12, 24, 0))?.greeting).toBe('greeting.christmasEve');
    expect(seasonalDay(local(2026, 12, 25, 23))?.greeting).toBe(
      'greeting.merryChristmas',
    );
    expect(seasonalDay(local(2026, 12, 31))?.effect).toBe('sparkle');
    expect(seasonalDay(local(2027, 1, 1))?.greeting).toBe('greeting.happyNewYear');
    expect(seasonalDay(local(2027, 1, 2))).toBeNull();
  });

  it('keys one season across the year change', () => {
    const event = SEASONAL_EVENTS[0];
    expect(seasonKey(event, local(2026, 12, 1))).toBe('winter-holidays-2026');
    expect(seasonKey(event, local(2027, 1, 6))).toBe('winter-holidays-2026');
    const spring: SeasonalEvent = {
      ...event,
      id: 'spring',
      start: [3, 1],
      end: [3, 9],
    };
    expect(seasonKey(spring, local(2027, 3, 5))).toBe('spring-2027');
  });

  it('ignores a day listed outside its own window', () => {
    const event: SeasonalEvent = {
      id: 'test',
      start: [5, 1],
      end: [5, 3],
      emojis: [],
      days: [
        {
          date: [6, 1],
          greeting: 'greeting.happyNewYear',
          emoji: '',
          effect: 'snow',
        },
      ],
    };
    expect(seasonalDay(local(2027, 6, 1), [event])).toBeNull();
  });

  it('has an English source string for every greeting', () => {
    for (const event of SEASONAL_EVENTS) {
      expect(event.emojis.length).toBeGreaterThan(0);
      for (const day of event.days) expect(en[day.greeting]).toBeTruthy();
    }
  });
});
