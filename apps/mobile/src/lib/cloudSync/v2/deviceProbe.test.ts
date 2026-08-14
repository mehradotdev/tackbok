/* eslint-disable import/first */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: 'test' } },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { document: '/document' } }));
jest.mock('react-native', () => ({
  Linking: { getInitialURL: jest.fn(), addEventListener: jest.fn() },
  Platform: { OS: 'android', Version: 36 },
}));

import {
  assertV7CanonicalReportIsRedacted,
  buildV7CanonicalDeviceReport,
} from './deviceProbe';

describe('V7 canonical device report', () => {
  it('builds a complete self-contained, redacted report envelope', () => {
    const report = buildV7CanonicalDeviceReport(new Date('2026-08-14T12:00:00.000Z'));
    expect(report).toEqual({
      format: 'tackbok-v7-canonical-device-report',
      formatVersion: 2,
      executedAt: '2026-08-14T12:00:00.000Z',
      scope: 'Android emulator',
      platform: 'android',
      runtimeVersion: 'android 36',
      appVersion: expect.any(String),
      buildType: 'debug',
      engine: expect.stringMatching(/Hermes/),
      acceptedVectors: 8,
      rejectedVectors: 11,
      passed: true,
      containsUserData: false,
      containsCredentialsOrAccountIdentifiers: false,
    });
    expect(() => assertV7CanonicalReportIsRedacted(JSON.stringify(report))).not.toThrow();
  });

  it('rejects credentials, account identifiers, sessions and fixture bodies', () => {
    for (const leaked of [
      { token: ['ya29', 'synthetic-token'].join('.') },
      { header: ['Bear', 'er synthetic-secret'].join('') },
      { uri: ['https://example.invalid?upload', '_id=secret'].join('') },
      { email: ['synthetic', 'example.invalid'].join('@') },
      { text: 'synthetic journal body' },
    ]) {
      expect(() => assertV7CanonicalReportIsRedacted(JSON.stringify(leaked))).toThrow();
    }
  });
});
