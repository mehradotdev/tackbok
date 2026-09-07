/** Serializes credential/configuration changes against foreground and background passes. */
export class CloudConnectionLifecycle {
  private generation = 0;
  private changes = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private passes = new Set<Promise<unknown>>();

  get epoch(): number { return this.generation; }

  async runPass<T>(epoch: number, operation: () => Promise<T>): Promise<T> {
    if (this.changes > 0 || epoch !== this.generation) {
      throw new Error('Cloud connection is changing; retry with the current connection');
    }
    const pass = Promise.resolve().then(operation);
    this.passes.add(pass);
    try { return await pass; }
    finally { this.passes.delete(pass); }
  }

  async change<T>(operation: () => Promise<T>): Promise<T> {
    // Close admission synchronously, including while another change is queued.
    this.changes++;
    this.generation++;
    const previous = this.tail;
    const change = previous.catch(() => undefined).then(async () => {
      await Promise.allSettled([...this.passes]);
      return operation();
    });
    this.tail = change;
    try { return await change; }
    finally { this.changes--; }
  }
}

export const cloudConnectionLifecycle = new CloudConnectionLifecycle();
