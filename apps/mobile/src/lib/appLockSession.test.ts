import { AppLockSession, normalizeAppLockDelay } from './appLockSession';

describe('app lock timing', () => {
  test.each([30, 60, 120] as const)('locks at the %i second boundary, not before', delay => {
    let now = 0;
    const session = new AppLockSession(() => now);
    expect(session.transition('background', delay)).toBe(false);
    now = delay * 1000 - 1;
    expect(session.transition('active', delay)).toBe(false);
    session.transition('background', delay);
    now += delay * 1000;
    expect(session.transition('active', delay)).toBe(true);
  });

  test('zero seconds locks immediately, while inactive dialogs do not', () => {
    const session = new AppLockSession();
    expect(session.transition('inactive', 0)).toBe(false);
    expect(session.transition('active', 0)).toBe(false);
    expect(session.transition('background', 0)).toBe(true);
  });

  test('repeated background events do not extend the grace period', () => {
    let now = 0;
    const session = new AppLockSession(() => now);
    session.transition('background', 30);
    now = 20_000;
    session.transition('background', 30);
    now = 30_000;
    expect(session.transition('active', 30)).toBe(true);
  });

  test.each([true, false])('Google completion with active=%s allows one return even at zero seconds', active => {
    const session = new AppLockSession();
    session.beginExternalAuthentication();
    expect(session.transition('background', 0)).toBe(false);
    if (active) expect(session.transition('active', 0)).toBe(false);
    session.endExternalAuthentication(active);
    expect(session.transition('active', 0)).toBe(false);
    expect(session.externalAuthenticationActive).toBe(false);
    expect(session.transition('background', 0)).toBe(true);
  });

  test('Google chooser to consent round trips stay exempt until the operation finishes', () => {
    const session = new AppLockSession();
    session.beginExternalAuthentication();
    for (let i = 0; i < 2; i++) {
      expect(session.transition('background', 0)).toBe(false);
      expect(session.transition('active', 0)).toBe(false);
      expect(session.externalAuthenticationActive).toBe(true);
    }
    session.endExternalAuthentication(true);
    expect(session.transition('background', 0)).toBe(true);
  });

  test('invalid persisted settings fail closed to zero seconds', () => {
    for (const value of [undefined, null, -1, 999, '120']) expect(normalizeAppLockDelay(value)).toBe(0);
    expect(normalizeAppLockDelay(120)).toBe(120);
  });
});
