export class CloudConnectionChangedError extends Error {
  constructor() {
    super('Cloud connection is changing; retry with the current connection');
    this.name = 'CloudConnectionChangedError';
  }
}

/** Serializes credential/configuration changes against foreground and background passes. */
export class CloudConnectionLifecycle {
  private generation = 0;
  private changes = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private passes = new Map<Promise<unknown>, AbortController>();
  private changeListeners = new Set<() => void>();

  get epoch(): number {
    return this.generation;
  }

  /**
   * Runs `listener` in every change, after running passes have drained and
   * before the change's operation, so state those passes left is dropped.
   */
  addChangeListener(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  async waitForChanges(): Promise<void> {
    // Include changes queued while an earlier change was settling.
    while (this.changes > 0) await this.tail.catch(() => undefined);
  }

  /**
   * Runs one pass under the current connection. The pass must stop its network
   * work when `signal` aborts; a connection change aborts it and then drains it.
   */
  async runPass<T>(
    epoch: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.changes > 0 || epoch !== this.generation) {
      throw new CloudConnectionChangedError();
    }
    const controller = new AbortController();
    const pass = Promise.resolve().then(() => operation(controller.signal));
    this.passes.set(pass, controller);
    try {
      return await pass;
    } finally {
      this.passes.delete(pass);
    }
  }

  async change<T>(operation: () => Promise<T>): Promise<T> {
    // Close admission synchronously, including while another change is queued.
    this.changes++;
    this.generation++;
    // Cancel running passes now, then drain them below before the operation
    // touches credentials: an aborted pass may still be settling local state.
    this.passes.forEach((controller) => controller.abort());
    const previous = this.tail;
    const change = previous
      .catch(() => undefined)
      .then(async () => {
        await Promise.allSettled([...this.passes.keys()]);
        this.changeListeners.forEach((listener) => listener());
        return operation();
      });
    this.tail = change;
    try {
      return await change;
    } finally {
      this.changes--;
    }
  }
}

export const cloudConnectionLifecycle = new CloudConnectionLifecycle();
