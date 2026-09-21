import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SetupProgress } from './setup-progress';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));

jest.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn, params?: { seconds: number }) =>
      mockTranslate('en', key, params),
  }),
}));

let root: ReactTestRenderer;
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => root?.unmount());
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
const initial = {
  configured: false,
  activityPhase: null,
  initialRestore: true,
  attentionReason: null,
} as const;
const content = () => JSON.stringify(root.toJSON());

test('shows actual restore phases', () => {
  act(() => {
    root = create(<SetupProgress snapshot={initial} />);
  });
  expect(content()).toContain(mockEn['cloud.settingUpCloudSync']);
  act(() => {
    root.update(<SetupProgress snapshot={{ ...initial, configured: true }} />);
  });
  expect(content()).toContain(mockEn['cloud.restoring']);
  act(() => {
    root.update(
      <SetupProgress
        snapshot={{ ...initial, configured: true, activityPhase: 'preparing' }}
      />,
    );
  });
  expect(content()).toContain(mockEn['cloud.preparingRestoredJournalData']);
});

test('shows elapsed time and slow-connection guidance after 90 seconds, without pretending progress', () => {
  act(() => {
    root = create(<SetupProgress snapshot={initial} />);
  });
  act(() => jest.advanceTimersByTime(89000));
  expect(content()).toContain('Elapsed time: 89 s');
  expect(content()).not.toContain(mockEn['cloud.setupTakingLonger']);
  act(() => jest.advanceTimersByTime(1000));
  expect(content()).toContain(mockEn['cloud.setupTakingLonger']);
  expect(content()).toContain(mockEn['cloud.settingUpCloudSync']);
});

test('shows an actionable attention message instead of a spinner when sync needs attention', () => {
  act(() => {
    root = create(
      <SetupProgress
        snapshot={{
          ...initial,
          configured: true,
          attentionReason: 'authorization-required',
        }}
      />,
    );
    jest.advanceTimersByTime(90000);
  });
  expect(content()).toContain(mockEn['cloud.googleDriveAuthorizationNeedsAttention']);
  expect(content()).not.toContain('ActivityIndicator');
  expect(content()).not.toContain(mockEn['cloud.setupTakingLonger']);
});
