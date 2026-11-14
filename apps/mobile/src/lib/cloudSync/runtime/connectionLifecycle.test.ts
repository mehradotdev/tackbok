import { CloudConnectionLifecycle } from './connectionLifecycle';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('cloud connection lifecycle', () => {
  test('disconnect waits for a pass and rejects foreground/background admission during the change', async () => {
    const lifecycle = new CloudConnectionLifecycle();
    const finish = deferred();
    const events: string[] = [];
    const epoch = lifecycle.epoch;
    const pass = lifecycle.runPass(epoch, async () => {
      await finish.promise;
      events.push('sync committed');
    });
    const change = lifecycle.change(async () => {
      events.push('disconnected');
    });
    await expect(lifecycle.runPass(lifecycle.epoch, async () => {})).rejects.toThrow(
      'changing',
    );
    expect(events).toEqual([]);
    finish.resolve();
    await Promise.all([pass, change]);
    expect(events).toEqual(['sync committed', 'disconnected']);
    await expect(lifecycle.runPass(epoch, async () => {})).rejects.toThrow('changing');
    await expect(
      lifecycle.runPass(lifecycle.epoch, async () => 'new connection'),
    ).resolves.toBe('new connection');
  });

  test('change listeners run after running passes drain and before the change', async () => {
    const lifecycle = new CloudConnectionLifecycle();
    const finish = deferred();
    const events: string[] = [];
    lifecycle.addChangeListener(() => events.push('listener'));
    const pass = lifecycle.runPass(lifecycle.epoch, async () => {
      await finish.promise;
      events.push('pass settled');
    });
    const change = lifecycle.change(async () => {
      events.push('changed');
    });
    finish.resolve();
    await Promise.all([pass, change]);
    expect(events).toEqual(['pass settled', 'listener', 'changed']);
  });

  test('a failed pass drains and queued changes remain serialized after a failed change', async () => {
    const lifecycle = new CloudConnectionLifecycle();
    const finish = deferred();
    const events: string[] = [];
    const pass = lifecycle.runPass(lifecycle.epoch, async () => {
      await finish.promise;
      throw new Error('network');
    });
    const failedPass = expect(pass).rejects.toThrow('network');
    const first = lifecycle.change(async () => {
      events.push('first');
      throw new Error('cancelled');
    });
    const failedChange = expect(first).rejects.toThrow('cancelled');
    const second = lifecycle.change(async () => {
      events.push('second');
    });
    finish.resolve();
    await Promise.all([failedPass, failedChange, second]);
    expect(events).toEqual(['first', 'second']);
    await expect(lifecycle.runPass(lifecycle.epoch, async () => true)).resolves.toBe(
      true,
    );
  });

  test('exclusive work keeps the epoch and running passes, and is ordered with changes', async () => {
    const lifecycle = new CloudConnectionLifecycle();
    const events: string[] = [];
    const epoch = lifecycle.epoch;
    const finish = deferred();
    let passSignal: AbortSignal | null = null;
    const pass = lifecycle.runPass(epoch, async (signal) => {
      passSignal = signal;
      await finish.promise;
      events.push('pass');
    });
    const holdChange = deferred();
    const change = lifecycle.change(async () => {
      await holdChange.promise;
      events.push('change');
    });
    // Waits for the earlier change, and a later change waits for it.
    const exclusive = lifecycle.exclusive(async () => {
      events.push('exclusive');
    });
    const later = lifecycle.change(async () => {
      events.push('later change');
    });
    finish.resolve();
    holdChange.resolve();
    await Promise.all([pass, change, exclusive, later]);
    expect(events).toEqual(['pass', 'change', 'exclusive', 'later change']);

    // On its own it neither moves the epoch nor cancels a pass.
    const current = lifecycle.epoch;
    const release = deferred();
    const running = lifecycle.runPass(current, async (signal) => {
      passSignal = signal;
      await release.promise;
      return 'kept';
    });
    await lifecycle.exclusive(async () => {});
    expect(lifecycle.epoch).toBe(current);
    expect(passSignal!.aborted).toBe(false);
    release.resolve();
    await expect(running).resolves.toBe('kept');
    await expect(lifecycle.runPass(current, async () => true)).resolves.toBe(true);
  });
});
