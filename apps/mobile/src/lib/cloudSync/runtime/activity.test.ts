import { phaseAfterCheckpoint, SyncActivity } from './activity';

describe('sync activity visibility', () => {
  test('automatic checks stay idle and only refresh the UI on completion', () => {
    const changed = jest.fn();
    const activity = new SyncActivity(changed);
    activity.report('checking');
    expect(activity.current).toBe('idle');
    expect(changed).not.toHaveBeenCalled();
    activity.report('idle');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  test('real work shows progress, then the next automatic check stays quiet', () => {
    const activity = new SyncActivity(jest.fn());
    activity.report('checking');
    activity.report('uploading');
    expect(activity.current).toBe('uploading');
    activity.report('checking');
    expect(activity.current).toBe('checking');
    activity.report('idle');
    activity.report('checking');
    expect(activity.current).toBe('idle');
  });

  test('manual sync reveals an already-running quiet check and resets when finished', () => {
    const activity = new SyncActivity(jest.fn());
    activity.report('checking');
    const finish = activity.beginManual();
    expect(activity.current).toBe('checking');
    activity.report('idle');
    expect(activity.current).toBe('checking');
    finish();
    expect(activity.current).toBe('idle');
    activity.report('checking');
    expect(activity.current).toBe('idle');
  });
});

describe('sync phase after an engine checkpoint', () => {
  test('publishing reads as saving, even while it applies the merged result', () => {
    expect(phaseAfterCheckpoint('after-local-mutation', 'checking')).toBe('preparing');
    expect(phaseAfterCheckpoint('after-candidate-persisted', 'preparing')).toBe(
      'uploading',
    );
    expect(phaseAfterCheckpoint('during-merge-application', 'uploading')).toBeNull();
  });

  test('adopting another device’s changes reads as downloading, never as saving', () => {
    expect(phaseAfterCheckpoint('during-merge-application', 'checking')).toBe(
      'downloading',
    );
    expect(phaseAfterCheckpoint('during-merge-application', 'downloading-media')).toBe(
      'downloading',
    );
  });

  test('remote reads stay quiet and bookkeeping never moves the phase', () => {
    expect(phaseAfterCheckpoint('during-remote-snapshot-download', 'idle')).toBe(
      'checking',
    );
    for (const point of [
      'during-media-transfer',
      'during-snapshot-cleanup',
      'after-base-shadow-temp-fsynced',
      'after-base-checkpoint-settled',
    ] as const) {
      expect(phaseAfterCheckpoint(point, 'downloading')).toBeNull();
    }
  });
});
