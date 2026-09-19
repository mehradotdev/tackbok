import {
  chooseGreeting,
  WEEKDAY_GREETINGS,
  greetingUnits,
  fitGreeting,
} from './greeting';

describe('cold-start greeting selection', () => {
  it.each([
    [0, 'greeting.goodMorning'],
    [11, 'greeting.goodMorning'],
    [12, 'greeting.goodAfternoon'],
    [16, 'greeting.goodAfternoon'],
    [17, 'greeting.goodEvening'],
    [23, 'greeting.goodEvening'],
  ])('uses local hour %s for %s', (hour, expected) => {
    expect(chooseGreeting(new Date(2026, 8, 19, hour as number), null, () => 0)).toBe(
      expected,
    );
  });
  it('uses the local weekday', () => {
    for (let day = 0; day < 7; day++) {
      expect(chooseGreeting(new Date(2026, 8, 20 + day, 10), null, () => 0.99)).toBe(
        WEEKDAY_GREETINGS[day],
      );
    }
  });
  it('never immediately repeats any eligible greeting', () => {
    const date = new Date(2026, 8, 19, 10);
    for (const previous of [
      'greeting.welcomeBack',
      'greeting.goodMorning',
      'greeting.happySaturday',
    ]) {
      for (const random of [0, 0.25, 0.5, 0.99]) {
        expect(chooseGreeting(date, previous, () => random)).not.toBe(previous);
      }
    }
  });
});

it('preserves emoji sequences and combining accents', () => {
  expect(greetingUnits('A👩🏽‍💻e\u0301!')).toEqual(['A', '👩🏽‍💻', 'e\u0301', '!']);
});
it('keeps Arabic and connected-script names intact even in English greetings', () => {
  expect(greetingUnits('Welcome محمد!')).toEqual(['Welcome ', 'محمد!']);
  expect(greetingUnits('नमस्ते माया')).toEqual(['नमस्ते ', 'माया']);
});
it('fits the entire line uniformly and truncates at a unit boundary', () => {
  expect(fitGreeting([20, 20, 20], 54, 8)).toEqual({
    scale: 0.9,
    count: 3,
    truncated: false,
  });
  expect(fitGreeting([20, 20, 20], 40, 8)).toEqual({
    scale: 0.8,
    count: 2,
    truncated: true,
  });
});

it('animates individual graphemes even when the runtime lacks Intl.Segmenter', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
  try {
    expect(greetingUnits('Hi Maya!')).toEqual(['H', 'i', ' ', 'M', 'a', 'y', 'a', '!']);
    expect(greetingUnits('👨‍👩‍👧‍👦🇮🇳e\u0301')).toEqual(['👨‍👩‍👧‍👦', '🇮🇳', 'e\u0301']);
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
    else Reflect.deleteProperty(Intl, 'Segmenter');
  }
});
