import {
  chooseGreeting,
  chooseGreetingEmoji,
  GREETING_EMOJIS,
  WEEKDAY_GREETINGS,
  greetingUnits,
  fitGreeting,
} from './greeting';

describe('cold-start greeting selection', () => {
  it.each([
    [0, 'greeting.goodNight'],
    [2, 'greeting.goodNight'],
    [3, 'greeting.happySaturday'],
    [4, 'greeting.happySaturday'],
    [5, 'greeting.goodMorning'],
    [11, 'greeting.goodMorning'],
    [12, 'greeting.goodAfternoon'],
    [16, 'greeting.goodAfternoon'],
    [17, 'greeting.goodEvening'],
    [21, 'greeting.goodEvening'],
    [22, 'greeting.goodNight'],
    [23, 'greeting.goodNight'],
  ])('uses local hour %s for %s', (hour, expected) => {
    expect(chooseGreeting(new Date(2026, 8, 19, hour as number), null, () => 0)).toBe(
      expected,
    );
  });
  it('keeps each greeting eligible through the last minute of its window', () => {
    for (const [hour, expected] of [
      [2, 'greeting.goodNight'],
      [4, 'greeting.happySaturday'],
      [11, 'greeting.goodMorning'],
      [16, 'greeting.goodAfternoon'],
      [21, 'greeting.goodEvening'],
    ] as const) {
      expect(chooseGreeting(new Date(2026, 8, 19, hour, 59), null, () => 0)).toBe(
        expected,
      );
    }
  });
  it('allows weekday repeats when no time-based greeting is eligible', () => {
    for (const hour of [3, 4]) {
      for (const random of [0, 0.99]) {
        expect(
          chooseGreeting(
            new Date(2026, 8, 19, hour),
            'greeting.happySaturday',
            () => random,
          ),
        ).toBe('greeting.happySaturday');
      }
    }
  });
  it('prevents repeats and still offers the weekday at night', () => {
    const date = new Date(2026, 8, 19, 22);
    expect(chooseGreeting(date, 'greeting.goodNight', () => 0)).toBe(
      'greeting.happySaturday',
    );
    expect(chooseGreeting(date, 'greeting.happySaturday', () => 0.99)).toBe(
      'greeting.goodNight',
    );
    expect(chooseGreeting(date, null, () => 0.99)).toBe('greeting.happySaturday');
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

it('randomly chooses a sleepy emoji only for good night', () => {
  expect(chooseGreetingEmoji('greeting.goodNight', () => 0)).toBe('😪');
  expect(chooseGreetingEmoji('greeting.goodNight', () => 0.99)).toBe('😴');
  for (const key of [
    'greeting.goodMorning',
    'greeting.goodAfternoon',
    'greeting.goodEvening',
    ...WEEKDAY_GREETINGS,
  ] as const) {
    expect(chooseGreetingEmoji(key, () => 0)).toBe(GREETING_EMOJIS[0]);
    expect(chooseGreetingEmoji(key, () => 0.99)).toBe(
      GREETING_EMOJIS[GREETING_EMOJIS.length - 1],
    );
  }
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
