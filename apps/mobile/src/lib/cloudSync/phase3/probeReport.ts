/**
 * Phase-3 probe report model.
 *
 * The report is the evidence artifact for `docs/cloud-sync/phase3/gate.md`. It
 * is written to the document directory and printed to the log, so it must be
 * safe to paste into a gate document. Redaction is enforced structurally (facts
 * are primitives with a length cap) and again by scanning the serialized report
 * for credential-shaped substrings before it is ever emitted.
 */

export type ProbeStatus =
  | 'passed'
  | 'failed'
  | 'inconclusive'
  | 'skipped'
  | 'awaiting-operator';

export type ProbeFact = string | number | boolean | null;

/**
 * `undefined` is admitted so a step can return different fact sets on its
 * success and failure branches. `JSON.stringify` drops those keys, so the
 * written report never carries them.
 */
export type ProbeFacts = Record<string, ProbeFact | undefined>;

export const MAXIMUM_FACT_LENGTH = 200;

/**
 * `detail` is prose written by a probe, not captured data, so it gets room to
 * explain a limitation properly. The redaction scan covers it either way; the
 * cap only exists so a runaway string cannot be pasted in wholesale.
 */
export const MAXIMUM_DETAIL_LENGTH = 1000;

export interface ProbeStep {
  id: string;
  title: string;
  status: ProbeStatus;
  /** Operator-readable outcome. Never contains credentials or journal data. */
  detail: string;
  facts: ProbeFacts;
  /**
   * Present when the step can only be completed outside the app (granting
   * consent, revoking access in Google account settings, confirming that no
   * revocation request appears). The operator resolves it in the probe screen.
   */
  operatorPrompt?: string;
}

export type ProbeGroupId =
  | 'connect'
  | 'drive-immutability'
  | 'resumable-upload'
  | 'session-recovery'
  | 'permanent-delete'
  | 'revocation-purge'
  | 'transfer'
  | 'silent-refresh'
  | 'external-revocation'
  | 'disconnect'
  | 'cleanup';

export interface ProbeGroupResult {
  id: ProbeGroupId;
  title: string;
  /** Worst status among the steps. */
  status: ProbeStatus;
  elapsedMs: number;
  steps: ProbeStep[];
}

export interface Phase3ProbeReport {
  probeSuite: 'cloud-sync-phase3';
  timestamp: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  buildType: 'debug' | 'release';
  /** The disposable probe vault. Always `probe-…`; never a real vault. */
  vaultId: string;
  groups: ProbeGroupResult[];
  status: ProbeStatus;
}

/**
 * Credential shapes that must never reach the report. `ya29.` is a Google
 * access token, `1//` a refresh token, `upload_id=` a resumable session URI.
 * The email pattern deliberately does not match `maskGoogleAccountEmail`
 * output, which separates its local part and host with `•` characters.
 */
const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'google access token', pattern: /ya29\.[\w-]{5,}/ },
  { name: 'google refresh token', pattern: /1\/\/[0-9A-Za-z_-]{10,}/ },
  { name: 'authorization header', pattern: /Bearer\s+\S/i },
  { name: 'resumable session URI', pattern: /upload_id=/i },
  { name: 'token field', pattern: /"(access|refresh|id)Token"/i },
  {
    name: 'unmasked account email',
    pattern: /[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9-]{2,}\.[A-Za-z]{2,}/,
  },
];

export class ProbeRedactionError extends Error {
  constructor(readonly patternName: string) {
    super(`Probe report contains a forbidden ${patternName}`);
    this.name = 'ProbeRedactionError';
  }
}

/**
 * Structural guard applied as facts are recorded. Long strings are the usual
 * way a token or a file body leaks into evidence, so they are rejected at the
 * source rather than truncated.
 */
export function assertProbeFact(key: string, value: ProbeFact | undefined): void {
  if (typeof value === 'string' && value.length > MAXIMUM_FACT_LENGTH) {
    throw new Error(`Probe fact "${key}" exceeds ${MAXIMUM_FACT_LENGTH} characters`);
  }
}

export function assertProbeDetail(id: string, detail: string): void {
  if (detail.length > MAXIMUM_DETAIL_LENGTH) {
    throw new Error(`Probe detail for "${id}" exceeds ${MAXIMUM_DETAIL_LENGTH} characters`);
  }
}

/** Throws if a serialized report contains anything credential-shaped. */
export function assertReportIsRedacted(serialized: string): void {
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(serialized)) throw new ProbeRedactionError(name);
  }
}

const SEVERITY: Record<ProbeStatus, number> = {
  passed: 0,
  skipped: 1,
  'awaiting-operator': 2,
  inconclusive: 3,
  failed: 4,
};

export function worstStatus(statuses: ProbeStatus[]): ProbeStatus {
  return statuses.reduce<ProbeStatus>(
    (worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst),
    'passed',
  );
}

/** Collects steps for one probe group and keeps every recorded fact in bounds. */
export class ProbeStepRecorder {
  private readonly steps: ProbeStep[] = [];

  record(step: ProbeStep): ProbeStep {
    for (const [key, value] of Object.entries(step.facts)) {
      assertProbeFact(key, value);
    }
    assertProbeDetail(step.id, step.detail);
    this.steps.push(step);
    return step;
  }

  /**
   * Runs one probe step. A thrown error becomes a failed step rather than
   * aborting the group, so a later independent check still produces evidence.
   */
  async step(
    id: string,
    title: string,
    body: () => Promise<Omit<ProbeStep, 'id' | 'title'>>,
  ): Promise<ProbeStep> {
    try {
      const result = await body();
      return this.record({ id, title, ...result });
    } catch (error) {
      return this.record({
        id,
        title,
        status: 'failed',
        detail: describeError(error),
        facts: {},
      });
    }
  }

  skip(id: string, title: string, detail: string): ProbeStep {
    return this.record({ id, title, status: 'skipped', detail, facts: {} });
  }

  results(): ProbeStep[] {
    return [...this.steps];
  }
}

/**
 * Runs one probe group. Individual steps record their own failures, so the
 * group always yields evidence for every check it managed to reach.
 */
export async function runProbeGroup(
  id: ProbeGroupId,
  title: string,
  body: (steps: ProbeStepRecorder) => Promise<void>,
): Promise<ProbeGroupResult> {
  const steps = new ProbeStepRecorder();
  const startedAt = Date.now();
  try {
    await body(steps);
  } catch (error) {
    steps.record({
      id: `${id}.aborted`,
      title: 'Group aborted',
      status: 'failed',
      detail: describeError(error),
      facts: {},
    });
  }
  const results = steps.results();
  return {
    id,
    title,
    status: worstStatus(results.map((step) => step.status)),
    elapsedMs: Date.now() - startedAt,
    steps: results,
  };
}

/**
 * Error text for the report. Provider and auth errors carry a category or code
 * that is diagnostic on its own; anything else is reduced to its message, which
 * this codebase never builds from a token or a journal value.
 */
export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; category?: unknown; code?: unknown; message?: unknown };
    const label =
      typeof candidate.category === 'string'
        ? candidate.category
        : typeof candidate.code === 'string'
          ? candidate.code
          : null;
    const message = typeof candidate.message === 'string' ? candidate.message : String(error);
    const combined = label ? `${label}: ${message}` : message;
    return combined.slice(0, MAXIMUM_FACT_LENGTH);
  }
  return String(error).slice(0, MAXIMUM_FACT_LENGTH);
}
