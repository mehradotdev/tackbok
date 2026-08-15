import {
  assertDriveV2ReportIsRedacted,
  type DriveV2RequestReport,
} from './instrumentation';

export type DriveV2ProbeStatus = 'passed' | 'failed' | 'inconclusive';

export interface DriveV2ProbeStep {
  id: string;
  title: string;
  status: DriveV2ProbeStatus;
  detail: string;
  facts: Record<string, boolean | number | string>;
  requests?: DriveV2RequestReport[];
}

export interface DriveV2ProbeReport {
  probeSuite: 'cloud-sync-v7-phase3';
  formatVersion: 1;
  timestamp: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  buildType: 'debug' | 'release';
  syntheticDataOnly: true;
  status: DriveV2ProbeStatus;
  steps: DriveV2ProbeStep[];
}

const SEVERITY: Record<DriveV2ProbeStatus, number> = {
  passed: 0,
  inconclusive: 1,
  failed: 2,
};

export interface DriveV2ProbeEnvironment {
  platform: string;
  osVersion: string;
  appVersion: string;
  buildType: 'debug' | 'release';
}

export function buildDriveV2ProbeReport(
  steps: readonly DriveV2ProbeStep[],
  environment: DriveV2ProbeEnvironment,
): DriveV2ProbeReport {
  const status = steps.reduce<DriveV2ProbeStatus>(
    (worst, step) => SEVERITY[step.status] > SEVERITY[worst] ? step.status : worst,
    'passed',
  );
  const report: DriveV2ProbeReport = {
    probeSuite: 'cloud-sync-v7-phase3',
    formatVersion: 1,
    timestamp: new Date().toISOString(),
    ...environment,
    syntheticDataOnly: true,
    status,
    steps: steps.map((step) => ({
      ...step,
      facts: { ...step.facts },
      requests: step.requests?.map((request) => ({ ...request })),
    })),
  };
  assertDriveV2ProbeReportIsRedacted(report);
  return report;
}

export function assertDriveV2ProbeReportIsRedacted(value: unknown): void {
  assertDriveV2ReportIsRedacted(value);
  const serialized = JSON.stringify(value);
  if (/\b(?:entries|tags|prompts|media)\s*:\s*\[/i.test(serialized)) {
    throw new Error('Drive v2 probe report contains a snapshot collection');
  }
  if (/synthetic reflection|synthetic presently entry/i.test(serialized)) {
    throw new Error('Drive v2 probe report contains fixture text');
  }
}
