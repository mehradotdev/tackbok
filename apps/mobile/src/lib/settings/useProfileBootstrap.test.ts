import React from 'react';
import { act, create } from 'react-test-renderer';
import { useProfileBootstrap } from './useProfileBootstrap';

const mockBackfill = jest.fn();
const mockProfile = { profileName: null, profileEmail: null, profileImageUri: null };
jest.mock('./store', () => ({
  useSettingsStore: { getState: () => mockProfile },
}));
jest.mock('~/lib/cloudSync/storage/backfill', () => ({
  runNormalizedModelBackfill: (...args: unknown[]) => mockBackfill(...args),
}));

beforeEach(() => mockBackfill.mockReset());

it('restores the profile on every cold mount, including when legacy settings have no name', async () => {
  for (let launch = 0; launch < 2; launch++) {
    let complete!: () => void;
    mockBackfill.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    let ready = false;
    function Probe({ databaseReady, settingsReady }: { databaseReady: boolean; settingsReady: boolean }) {
      const value = useProfileBootstrap(databaseReady, settingsReady);
      React.useEffect(() => { ready = value; }, [value]);
      return null;
    }
    let root!: ReturnType<typeof create>;
    act(() => { root = create(React.createElement(Probe, { databaseReady: false, settingsReady: false })); });
    expect(mockBackfill).toHaveBeenCalledTimes(launch);
    act(() => { root.update(React.createElement(Probe, { databaseReady: true, settingsReady: false })); });
    expect(mockBackfill).toHaveBeenCalledTimes(launch);
    act(() => { root.update(React.createElement(Probe, { databaseReady: true, settingsReady: true })); });
    expect(mockBackfill).toHaveBeenLastCalledWith(mockProfile);
    expect(mockBackfill).toHaveBeenCalledTimes(launch + 1);
    expect(ready).toBe(false);
    await act(async () => { complete(); });
    expect(ready).toBe(true);
    act(() => root.unmount());
  }
});

it('keeps migration failure nonfatal so the runtime can retry', async () => {
  mockBackfill.mockRejectedValue(new Error('database temporarily unavailable'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  let ready = false;
  function Probe() {
    const value = useProfileBootstrap(true, true);
    React.useEffect(() => { ready = value; }, [value]);
    return null;
  }
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(React.createElement(Probe)); });
  expect(ready).toBe(true);
  expect(warning).toHaveBeenCalledWith('Profile initialization failed');
  act(() => root.unmount());
  warning.mockRestore();
});
