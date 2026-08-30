export type DriveMethodClass =
  | 'start-token'
  | 'list'
  | 'download'
  | 'create'
  | 'update'
  | 'delete'
  | 'resumable-start'
  | 'resumable-chunk';

export type DriveResultClass =
  | 'success'
  | 'authorization'
  | 'permission'
  | 'quota'
  | 'rate-limit'
  | 'not-found'
  | 'invalid'
  | 'transient';

export interface DriveRequestMetric {
  methodClass: DriveMethodClass;
  resultClass: DriveResultClass;
  durationBucket: '<100ms' | '<500ms' | '<2s' | '<10s' | '>=10s';
  requestBytesBucket: '0' | '<64KiB' | '<1MiB' | '<16MiB' | '>=16MiB';
  responseBytesBucket: 'unknown' | '0' | '<64KiB' | '<1MiB' | '<16MiB' | '>=16MiB';
  retry: boolean;
  quotaUnits: number;
}

export interface DriveInstrumentationSink {
  record(metric: DriveRequestMetric): void;
}

export interface DriveRequestReport {
  format: 'tackbok-drive-request-report';
  scenario: string;
  attempts: number;
  retries: number;
  estimatedQuotaUnits: number;
  byMethod: Record<string, number>;
  byResult: Record<string, number>;
}

export class MemoryDriveInstrumentation implements DriveInstrumentationSink {
  readonly metrics: DriveRequestMetric[] = [];

  constructor(readonly scenario: string) {}

  record(metric: DriveRequestMetric): void {
    this.metrics.push({ ...metric });
  }

  report(): DriveRequestReport {
    const byMethod: Record<string, number> = {};
    const byResult: Record<string, number> = {};
    for (const metric of this.metrics) {
      byMethod[metric.methodClass] = (byMethod[metric.methodClass] ?? 0) + 1;
      byResult[metric.resultClass] = (byResult[metric.resultClass] ?? 0) + 1;
    }
    const report: DriveRequestReport = {
      format: 'tackbok-drive-request-report',
      scenario: this.scenario,
      attempts: this.metrics.length,
      retries: this.metrics.filter((metric) => metric.retry).length,
      estimatedQuotaUnits: this.metrics.reduce(
        (total, metric) => total + metric.quotaUnits,
        0,
      ),
      byMethod,
      byResult,
    };
    assertDriveReportIsRedacted(report);
    return report;
  }
}

const FORBIDDEN_REPORT_PATTERNS: readonly [string, RegExp][] = [
  ['bearer token', /bearer\s+[a-z0-9._~+/=-]+/i],
  ['OAuth token', /(?:ya29\.|1\/\/)[a-z0-9._~+/=-]+/i],
  ['email address', /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['resumable session URI', /upload_id=|\/upload\/session/i],
  ['Google Drive URL', /https?:\/\/(?:www\.)?googleapis\.com/i],
];

export function assertDriveReportIsRedacted(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const [label, pattern] of FORBIDDEN_REPORT_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`Drive report contains forbidden ${label}`);
    }
  }
  for (const forbiddenKey of [
    'token', 'email', 'account', 'fileId', 'fileName', 'logicalKey', 'query',
    'url', 'uri', 'body', 'content', 'snapshotId', 'blobHash', 'deviceId',
  ]) {
    if (new RegExp(`"${forbiddenKey}"\\s*:`, 'i').test(serialized)) {
      throw new Error(`Drive report contains forbidden field ${forbiddenKey}`);
    }
  }
}

export function driveDurationBucket(milliseconds: number): DriveRequestMetric['durationBucket'] {
  if (milliseconds < 100) return '<100ms';
  if (milliseconds < 500) return '<500ms';
  if (milliseconds < 2_000) return '<2s';
  if (milliseconds < 10_000) return '<10s';
  return '>=10s';
}

export function driveByteBucket(
  bytes: number,
): Exclude<DriveRequestMetric['responseBytesBucket'], 'unknown'> {
  if (bytes === 0) return '0';
  if (bytes < 64 * 1024) return '<64KiB';
  if (bytes < 1024 * 1024) return '<1MiB';
  if (bytes < 16 * 1024 * 1024) return '<16MiB';
  return '>=16MiB';
}

export function driveQuotaUnits(method: DriveMethodClass): number {
  if (method === 'list') return 100;
  if (method === 'download') return 200;
  if (method === 'start-token') return 5;
  return 50;
}
