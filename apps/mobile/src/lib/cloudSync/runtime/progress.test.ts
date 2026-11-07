import {
  ETA_MIN_ELAPSED_MS,
  SyncProgressTracker,
  estimateRemainingMs,
  type ProgressClock,
} from './progress';

function manualClock() {
  let now = 1_000_000;
  const timers: { at: number; callback: () => void }[] = [];
  const clock: ProgressClock = {
    now: () => now,
    setTimer: (callback, delayMs) => {
      const timer = { at: now + delayMs, callback };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (timer) => {
      const index = timers.indexOf(timer as unknown as (typeof timers)[number]);
      if (index >= 0) timers.splice(index, 1);
    },
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (timer.at > now) continue;
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
    },
    get pending() {
      return timers.length;
    },
  };
}

/** Unthrottled tracker for counting logic. */
function tracker() {
  const time = manualClock();
  const changed = jest.fn();
  const progress = new SyncProgressTracker(changed, time.clock, 0);
  progress.report({ type: 'pass', state: 'start' });
  return { progress, time, changed, current: () => progress.current.progress };
}

describe('step math', () => {
  test('steps follow the phase and never move back within a planning attempt', () => {
    const { progress, current } = tracker();
    progress.report({ type: 'plan', phase: 'checking' });
    expect(current()).toMatchObject({ phase: 'checking', step: 1, totalSteps: 4 });
    progress.report({ type: 'plan', phase: 'downloading', items: { done: 0, total: 2 } });
    expect(current()).toMatchObject({ step: 2 });
    progress.report({ type: 'plan', phase: 'merging' });
    expect(current()).toMatchObject({ step: 3 });
    progress.report({ type: 'plan', phase: 'uploading', bytesTotal: 10 });
    expect(current()).toMatchObject({ step: 4 });
    // Adopting a snapshot after media transfers is still the last step.
    progress.report({ type: 'phase', phase: 'merging' });
    expect(current()).toMatchObject({ phase: 'merging', step: 4 });
  });

  test('re-planning from the check resets the step and every count', () => {
    const { progress, current } = tracker();
    progress.report({
      type: 'plan',
      phase: 'downloading',
      items: { done: 0, total: 3 },
    });
    progress.report({ type: 'item', phase: 'downloading' });
    progress.report({ type: 'plan', phase: 'uploading', bytesTotal: 100 });
    progress.report({ type: 'bytes', key: 'snapshot', done: 40 });
    progress.report({ type: 'plan', phase: 'checking' });
    expect(current()).toEqual({ phase: 'checking', step: 1, totalSteps: 4 });
    progress.report({ type: 'phase', phase: 'uploading' });
    expect(current()?.bytes).toBeUndefined();
  });

  test('a pass end clears progress and the next pass starts empty', () => {
    const { progress, current } = tracker();
    progress.report({ type: 'plan', phase: 'uploading', bytesTotal: 100 });
    progress.report({ type: 'bytes', key: 'snapshot', done: 50 });
    progress.report({ type: 'pass', state: 'end' });
    expect(current()).toBeNull();
    progress.report({ type: 'pass', state: 'start' });
    progress.report({ type: 'phase', phase: 'uploading' });
    expect(current()).toEqual({ phase: 'uploading', step: 4, totalSteps: 4 });
  });
});

describe('counts', () => {
  test('items and bytes only move forward and never pass their totals', () => {
    const { progress, current } = tracker();
    progress.report({
      type: 'plan',
      phase: 'uploading-media',
      items: { done: 0, total: 2 },
      bytesTotal: 300,
    });
    progress.report({ type: 'bytes', key: 'a', done: 100 });
    // A retried read starts over; it must not count twice or move backwards.
    progress.report({ type: 'bytes', key: 'a', done: 20 });
    expect(current()?.bytes).toEqual({ done: 100, total: 300 });
    progress.report({ type: 'item', phase: 'uploading-media' });
    progress.report({ type: 'bytes', key: 'b', done: 250 });
    expect(current()?.bytes).toEqual({ done: 300, total: 300 });
    progress.report({ type: 'item', phase: 'uploading-media' });
    progress.report({ type: 'item', phase: 'uploading-media' });
    expect(current()?.items).toEqual({ done: 2, total: 2 });
  });

  test('media directions keep their own counts while transfers alternate', () => {
    const { progress, current } = tracker();
    progress.report({
      type: 'plan',
      phase: 'uploading-media',
      items: { done: 0, total: 2 },
      bytesTotal: 20,
    });
    progress.report({
      type: 'plan',
      phase: 'downloading-media',
      items: { done: 0, total: 1 },
      bytesTotal: 5,
    });
    progress.report({ type: 'phase', phase: 'uploading-media' });
    progress.report({ type: 'bytes', key: 'up-1', done: 10 });
    progress.report({ type: 'item', phase: 'uploading-media' });
    progress.report({ type: 'phase', phase: 'downloading-media' });
    progress.report({ type: 'bytes', key: 'down-1', done: 5 });
    progress.report({ type: 'item', phase: 'downloading-media' });
    expect(current()).toMatchObject({
      items: { done: 1, total: 1 },
      bytes: { done: 5, total: 5 },
    });
    progress.report({ type: 'phase', phase: 'uploading-media' });
    expect(current()).toMatchObject({
      items: { done: 1, total: 2 },
      bytes: { done: 10, total: 20 },
    });
  });

  test('bytes without a known total are not shown', () => {
    const { progress, current } = tracker();
    progress.report({ type: 'plan', phase: 'downloading', items: { done: 0, total: 3 } });
    progress.report({ type: 'bytes', key: 'snapshot', done: 1_000 });
    expect(current()).toEqual({
      phase: 'downloading',
      step: 2,
      totalSteps: 4,
      items: { done: 0, total: 3 },
    });
  });
});

describe('time estimate', () => {
  test('appears only after enough time and enough of the total', () => {
    expect(estimateRemainingMs(undefined, 50, 100, 10_000)).toBeUndefined();
    const sample = { at: 0, done: 0 };
    // Too soon, even with plenty moved.
    expect(estimateRemainingMs(sample, 50, 100, ETA_MIN_ELAPSED_MS - 1)).toBeUndefined();
    // Long enough, but under 10% of the total moved.
    expect(estimateRemainingMs(sample, 9, 100, 60_000)).toBeUndefined();
    expect(estimateRemainingMs(sample, 10, 100, 6_000)).toBe(54_000);
    expect(estimateRemainingMs(sample, 100, 100, 60_000)).toBeUndefined();
  });

  test('measures from the first sample, so resumed bytes do not read as speed', () => {
    const { progress, time, current } = tracker();
    progress.report({ type: 'plan', phase: 'uploading-media', bytesTotal: 1_000 });
    // A resumed upload reports its earlier 500 bytes at once.
    progress.report({ type: 'bytes', key: 'a', done: 500 });
    time.advance(10_000);
    progress.report({ type: 'bytes', key: 'a', done: 600 });
    // 100 bytes in 10 s: 400 bytes left take about 40 s.
    expect(current()?.etaMs).toBe(40_000);
  });
});

describe('throttling', () => {
  test('publishes at most every interval and always delivers the latest state', () => {
    const time = manualClock();
    const changed = jest.fn();
    const progress = new SyncProgressTracker(changed, time.clock, 250);
    progress.report({ type: 'pass', state: 'start' });
    progress.report({ type: 'plan', phase: 'uploading', bytesTotal: 1_000 });
    for (let done = 100; done <= 900; done += 100) {
      time.advance(10);
      progress.report({ type: 'bytes', key: 'snapshot', done });
    }
    // The pass start published immediately; the rest waits for one trailing update.
    expect(changed).toHaveBeenCalledTimes(1);
    expect(progress.current.progress).toBeNull();
    time.advance(250);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(progress.current.progress?.bytes).toEqual({ done: 900, total: 1_000 });
    expect(time.pending).toBe(0);
  });

  test('a pass end publishes at once and cancels a pending update', () => {
    const time = manualClock();
    const changed = jest.fn();
    const progress = new SyncProgressTracker(changed, time.clock, 250);
    progress.report({ type: 'pass', state: 'start' });
    progress.report({ type: 'plan', phase: 'checking' });
    expect(time.pending).toBe(1);
    progress.report({ type: 'pass', state: 'end' });
    expect(time.pending).toBe(0);
    expect(progress.current.progress).toBeNull();
  });
});

describe('waits', () => {
  test('retry waits show with their end and clear when the request resumes', () => {
    const { progress, current } = tracker();
    progress.report({ type: 'plan', phase: 'checking' });
    progress.report({ type: 'wait', reason: 'rate-limited', until: 2_000_000 });
    expect(current()?.waiting).toEqual({ reason: 'rate-limited', until: 2_000_000 });
    progress.report({ type: 'wait', reason: null });
    expect(current()?.waiting).toBeUndefined();
  });

  test('offline comes from the platform and outranks a retry countdown', () => {
    const { progress, current } = tracker();
    progress.report({ type: 'plan', phase: 'checking' });
    progress.report({ type: 'wait', reason: 'retry-backoff', until: 2_000_000 });
    progress.networkChanged(false);
    expect(current()?.waiting).toEqual({ reason: 'offline' });
    progress.networkChanged(true);
    expect(current()?.waiting).toEqual({ reason: 'retry-backoff', until: 2_000_000 });
  });

  test('a Wi-Fi hold outlives its pass until the network changes or a pass starts', () => {
    const { progress, current } = tracker();
    progress.report({
      type: 'plan',
      phase: 'uploading-media',
      items: { done: 0, total: 1 },
    });
    progress.report({ type: 'wait', reason: 'wifi-only-media' });
    expect(current()?.waiting).toEqual({ reason: 'wifi-only-media' });
    progress.report({ type: 'pass', state: 'end' });
    expect(progress.current).toEqual({ progress: null, idleWait: 'wifi-only-media' });
    progress.networkChanged(true);
    expect(progress.current.idleWait).toBeNull();

    progress.report({ type: 'pass', state: 'start' });
    progress.report({ type: 'wait', reason: 'wifi-only-media' });
    progress.report({ type: 'pass', state: 'end' });
    progress.report({ type: 'pass', state: 'start' });
    expect(progress.current.idleWait).toBeNull();
  });
});
