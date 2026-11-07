import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SyncStatusLine } from './sync-status';
import type { SyncProgress } from '~/lib/cloudSync/ui';
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
    locale: 'en',
    t: (key: keyof typeof mockEn, params?: Record<string, string | number>) =>
      mockTranslate('en', key, params),
  }),
}));

let root: ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);
});
afterEach(() => {
  act(() => root?.unmount());
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

function render(progress: SyncProgress | null) {
  act(() => {
    root = create(
      <SyncStatusLine phase="uploading" initialRestore={false} progress={progress} />,
    );
  });
}
const content = () => JSON.stringify(root.toJSON());
const progressbar = () =>
  root.root.find((node) => node.props.accessibilityRole === 'progressbar');
const bar = () =>
  root.root.findAll(
    (node) => (node.type as unknown) === 'View' && node.props.style?.width !== undefined,
  );

test('a known total shows a real bar, the amount and the step', () => {
  render({
    phase: 'uploading-media',
    step: 4,
    totalSteps: 4,
    items: { done: 3, total: 12 },
    bytes: { done: 8_400_000, total: 31_000_000 },
    etaMs: 70_000,
  });
  expect(content()).toContain('Uploading photos and voice notes…');
  expect(content()).toContain('3 of 12 (8.4 MB of 31 MB)');
  expect(content()).toContain('Step 4 of 4 · about 1 min left');
  expect(content()).toContain(mockEn['cloud.syncIsFasterWithTackbokOpen']);
  expect(bar()).toHaveLength(1);
  expect(bar()[0].props.style).toEqual({ width: '27%' });
  expect(progressbar().props.accessibilityValue).toEqual({ min: 0, max: 100, now: 27 });
  expect(
    root.root.findAll((node) => (node.type as unknown) === 'ActivityIndicator'),
  ).toHaveLength(0);
});

test('without a total the indicator stays indeterminate', () => {
  render({ phase: 'merging', step: 3, totalSteps: 4 });
  expect(content()).toContain('Combining changes…');
  expect(content()).toContain('Step 3 of 4');
  expect(bar()).toHaveLength(0);
  expect(
    root.root.findAll((node) => (node.type as unknown) === 'ActivityIndicator'),
  ).toHaveLength(1);
});

test('before detailed progress arrives it keeps the phase line', () => {
  render(null);
  expect(content()).toContain(mockEn['cloud.savingYourChangesToGoogleDrive']);
  expect(content()).not.toContain('Step');
  expect(content()).toContain(mockEn['cloud.syncIsFasterWithTackbokOpen']);
});

test('a rate-limit wait counts down live and pauses the bar', () => {
  render({
    phase: 'checking',
    step: 1,
    totalSteps: 4,
    items: { done: 2, total: 3 },
    waiting: { reason: 'rate-limited', until: 1_000_000 + 40_000 },
  });
  expect(content()).toContain('2 of 3 devices checked');
  expect(content()).toContain('Google asked us to slow down. Trying again in 40 s');
  expect(bar()).toHaveLength(0);
  act(() => jest.advanceTimersByTime(3_000));
  expect(content()).toContain('Trying again in 37 s');
  // The countdown stops once the wait is over.
  act(() => {
    root.update(
      <SyncStatusLine
        phase="checking"
        initialRestore={false}
        progress={{
          phase: 'checking',
          step: 1,
          totalSteps: 4,
          items: { done: 3, total: 3 },
        }}
      />,
    );
  });
  expect(content()).not.toContain('Trying again');
  expect(jest.getTimerCount()).toBe(0);
});

test('offline and Wi-Fi waits explain themselves without a countdown', () => {
  render({ phase: 'checking', step: 1, totalSteps: 4, waiting: { reason: 'offline' } });
  expect(content()).toContain('Waiting for internet…');
  expect(jest.getTimerCount()).toBe(0);
  act(() => {
    root.update(
      <SyncStatusLine
        phase="uploading"
        initialRestore={false}
        progress={{
          phase: 'uploading-media',
          step: 4,
          totalSteps: 4,
          waiting: { reason: 'wifi-only-media' },
        }}
      />,
    );
  });
  expect(content()).toContain('Waiting for Wi-Fi to sync photos and voice notes');
});
