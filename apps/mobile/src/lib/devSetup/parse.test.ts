import { getDevSetupFromUrl, parseDevSetup } from './parse';

jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));

describe('parseDevSetup', () => {
  test('reads every supported setting', () => {
    expect(
      parseDevSetup(
        'reset=1,restore=tackbok-demo-backup.zip,theme=dark,fontSize=large,titleFont=lora,' +
          'locale=ar,onboarding=done,coachMarks=off,greeting=off,betaBadge=off,screen=/insights',
      ),
    ).toEqual({
      setup: {
        reset: true,
        restore: 'tackbok-demo-backup.zip',
        theme: 'dark',
        fontSize: 'large',
        titleFont: 'lora',
        locale: 'ar',
        onboarding: 'done',
        coachMarks: false,
        greeting: false,
        betaBadge: false,
        screen: '/insights',
      },
      errors: [],
    });
  });

  test('accepts the default title font, the device locale and blank pairs', () => {
    expect(
      parseDevSetup(
        ' titleFont=default, ,locale = device,coachMarks=on,whatsNew=on,run=1747,',
      ),
    ).toEqual({
      setup: { titleFont: 'default', locale: 'device', coachMarks: true, whatsNew: true },
      errors: [],
    });
  });

  test('reports unknown keys and values instead of guessing', () => {
    const { setup, errors } = parseDevSetup(
      'theme=nope,fontSize=huge,titleFont=comic,locale=fr,onboarding=skip,greeting=no,' +
        'restore=../secret.zip,restore=notes.txt,screen=insights,screen=/,reset=0,' +
        'run=a b,coachMarks=constructor,colour=red',
    );
    expect(setup).toEqual({});
    expect(errors).toHaveLength(14);
    expect(errors.at(-1)).toBe('unknown setting "colour"');
  });
});

describe('getDevSetupFromUrl', () => {
  test('reads the encoded setup parameter from a launch URL', () => {
    expect(
      getDevSetupFromUrl('tackbok-beta://?tackbokDevSetup=theme%3Ddark%2ConboardIng'),
    ).toBe('theme=dark,onboardIng');
    expect(getDevSetupFromUrl('tackbok-beta:///?a=1&tackbokDevSetup=theme=dark#x')).toBe(
      'theme=dark',
    );
  });

  test('ignores launches without it', () => {
    expect(getDevSetupFromUrl(null)).toBeNull();
    expect(getDevSetupFromUrl('tackbok-beta://insights?theme=dark')).toBeNull();
  });
});
