import { CloudConnectionLifecycle } from './connectionLifecycle';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
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
    const change = lifecycle.change(async () => { events.push('disconnected'); });
    await expect(lifecycle.runPass(lifecycle.epoch, async () => {})).rejects.toThrow('changing');
    expect(events).toEqual([]);
    finish.resolve();
    await Promise.all([pass, change]);
    expect(events).toEqual(['sync committed', 'disconnected']);
    await expect(lifecycle.runPass(epoch, async () => {})).rejects.toThrow('changing');
    await expect(lifecycle.runPass(lifecycle.epoch, async () => 'new connection')).resolves.toBe('new connection');
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
    const second = lifecycle.change(async () => { events.push('second'); });
    finish.resolve();
    await Promise.all([failedPass, failedChange, second]);
    expect(events).toEqual(['first', 'second']);
    await expect(lifecycle.runPass(lifecycle.epoch, async () => true)).resolves.toBe(true);
  });
});
