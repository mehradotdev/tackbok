import { PHASE_FOR_ENGINE_ACTIVITY, SyncActivity } from './activity';

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

describe('sync phase for engine activity', () => {
  test('publishing reads as saving, adopting reads as downloading, reads stay quiet', () => {
    expect(PHASE_FOR_ENGINE_ACTIVITY).toEqual({
      'preparing-local-changes': 'preparing',
      'reading-remote-snapshot': 'checking',
      'publishing-local-snapshot': 'uploading',
      'applying-remote-snapshot': 'downloading',
    });
  });
});
