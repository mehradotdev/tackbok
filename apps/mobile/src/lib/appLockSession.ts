export type AppLockDelaySeconds = 0 | 30 | 60 | 120;
export function normalizeAppLockDelay(value: unknown): AppLockDelaySeconds {
  return value === 30 || value === 60 || value === 120 ? value : 0;
}

/** In-memory session only: a process restart never inherits an unlock grace period. */
export class AppLockSession {
  private backgroundedAt: number | null = null;
  private externalDepth = 0;
  private awaitingExternalReturn = false;
  constructor(private readonly now: () => number = Date.now) {}

  get externalAuthenticationActive(): boolean {
    return this.externalDepth > 0 || this.awaitingExternalReturn;
  }

  beginExternalAuthentication(): void {
    this.externalDepth++;
    this.backgroundedAt = null;
  }

  endExternalAuthentication(active: boolean): void {
    this.externalDepth = Math.max(0, this.externalDepth - 1);
    if (this.externalDepth === 0) this.awaitingExternalReturn = !active;
    this.backgroundedAt = null;
  }

  /** Returns whether this transition requires a new lock; never unlocks an existing lock. */
  transition(state: string, delaySeconds: AppLockDelaySeconds): boolean {
    if (state === 'background') {
      if (this.externalAuthenticationActive) return false;
      this.backgroundedAt ??= this.now();
      return delaySeconds === 0;
    }
    if (state !== 'active') return false;
    if (this.externalAuthenticationActive) {
      this.awaitingExternalReturn = false;
      this.backgroundedAt = null;
      return false;
    }
    const backgroundedAt = this.backgroundedAt;
    this.backgroundedAt = null;
    if (backgroundedAt === null) return false;
    const elapsed = this.now() - backgroundedAt;
    return elapsed < 0 || elapsed >= delaySeconds * 1_000;
  }
}
