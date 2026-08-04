import { getScreenName, SCREEN_ROUTE_MAP } from './events';

describe('analytics screen routes', () => {
  test.each(Object.entries(SCREEN_ROUTE_MAP))(
    'maps %s to %s',
    (pattern, screen) => {
      const pathname = pattern.replace(/\[[^/]+\]/g, 'example');
      expect(getScreenName(pathname)).toBe(screen);
    },
  );

  test.each([
    '/not-allowlisted',
    '/onboarding/welcome',
    '/gratitudeEntry/note-123/extra',
    '/dateEntries',
  ])('does not track unknown route %s', (pathname) => {
    expect(getScreenName(pathname)).toBeNull();
  });
});
