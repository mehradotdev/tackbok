import { getSplashMode, isLaunchFromLink, SPLASH_TIMELINES } from './splash';

describe('launch animation mode', () => {
  test('plays the story on a normal cold start', () => {
    expect(
      getSplashMode({
        appLockEnabled: false,
        openedFromLink: false,
        reduceMotion: false,
      }),
    ).toBe('story');
  });

  test('uses a plain fade with Reduce Motion', () => {
    expect(
      getSplashMode({
        appLockEnabled: false,
        openedFromLink: false,
        reduceMotion: true,
      }),
    ).toBe('fade');
  });

  test.each([
    { appLockEnabled: true, openedFromLink: false },
    { appLockEnabled: false, openedFromLink: true },
    { appLockEnabled: true, openedFromLink: true },
  ])('gets out of the way for app lock or a link (%o)', (input) => {
    expect(getSplashMode({ ...input, reduceMotion: false })).toBe('none');
    expect(getSplashMode({ ...input, reduceMotion: true })).toBe('none');
  });
});

describe('launch from a link', () => {
  test('a deep link or a reminder path counts', () => {
    expect(isLaunchFromLink('tackbok://entry/new', null)).toBe(true);
    expect(isLaunchFromLink(null, { url: '/entry/new' })).toBe(true);
  });

  test('a plain launch, the dev client URL or unusable reminder data does not', () => {
    expect(isLaunchFromLink(null, null)).toBe(false);
    expect(isLaunchFromLink('', null)).toBe(false);
    expect(
      isLaunchFromLink(
        'tackbok-beta://expo-development-client/?url=http%3A%2F%2Flocalhost',
        {},
      ),
    ).toBe(false);
    expect(isLaunchFromLink(null, { url: 42 })).toBe(false);
    expect(isLaunchFromLink(null, { url: 'https://example.com' })).toBe(false);
  });
});

describe('timelines', () => {
  test.each(Object.entries(SPLASH_TIMELINES))(
    '%s ranges fit inside its duration',
    (_, t) => {
      const ranges = [t.fold?.close, t.fold?.open, t.beat, t.zoom, t.fadeOut].filter(
        (range): range is [number, number] => range != null,
      );
      for (const [start, end] of ranges) {
        expect(start).toBeLessThan(end);
        expect(end).toBeLessThanOrEqual(t.duration);
      }
      expect(t.fadeOut[1]).toBe(t.duration);
    },
  );
});

test('the story moves from its first frame and stays short', () => {
  // The native splash already showed the still logo; holding it again reads as a pause.
  expect(SPLASH_TIMELINES.story.fold?.close[0]).toBe(0);
  expect(SPLASH_TIMELINES.story.duration).toBeLessThanOrEqual(2300);
});
