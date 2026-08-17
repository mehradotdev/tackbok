import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';

import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import {
  runDriveV2RealProbe,
  V7_PHASE3_PROBE_FILENAME,
  writeDriveV2ProbeReport,
} from '~/lib/cloudSync/v2/drive/probeRunner';
import type { DriveV2ProbeReport } from '~/lib/cloudSync/v2/drive/probeReport';
import {
  isV7DeviceHardeningProbeEnabled,
  seedV7LargeMediaProductionProbe,
  verifyV7LargeMediaProductionProbe,
} from '~/lib/cloudSync/v2/deviceHardeningProbe';

const STATUS_CLASS = {
  passed: 'text-primary',
  failed: 'text-destructive',
  inconclusive: 'text-destructive',
} as const;

/** Permanent, development-only entry point for the destructive V7-3 evidence run. */
export default function DevV7CloudProbesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ run?: string }>();
  const autoStarted = useRef(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DriveV2ProbeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const run = useCallback(async (authorization: 'interactive' | 'stored' = 'interactive') => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await runDriveV2RealProbe({ authorization });
      setReport(next);
      await writeDriveV2ProbeReport(next);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'V7-3 probe failed');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    if ((params.run !== 'all' && params.run !== 'attach') || autoStarted.current) return;
    autoStarted.current = true;
    setAcknowledged(true);
    void run(params.run === 'attach' ? 'stored' : 'interactive');
  }, [params.run, run]);

  if (!isV7DeviceHardeningProbeEnabled()) {
    router.back();
    return null;
  }

  return (
    <View className="flex-1 bg-background px-safe-or-4 pt-safe-or-4">
      <Text variant="h2" className="text-foreground font-heading pb-1">
        V7-3 Drive probes
      </Text>
      <Text className="text-muted-foreground text-xs pb-3">
        This evidence screen uses only synthetic vault data. Run it only with a disposable Google
        test account listed on the OAuth consent screen.
      </Text>

      <View className="flex-row items-center gap-3 pb-3">
        <Switch checked={acknowledged} onCheckedChange={setAcknowledged} />
        <Text className="text-foreground text-sm flex-1">
          This device uses a disposable Google test account.
        </Text>
      </View>

      {__DEV__ && (
        <>
          <Button
            disabled={!acknowledged || busy}
            variant="primary"
            onPress={() => void run('interactive')}>
            <Text>{busy ? 'Running destructive probes…' : 'Connect and run all probes'}</Text>
          </Button>
        </>
      )}

      <Button
        className="mt-3"
        disabled={!acknowledged || seedBusy || busy}
        variant="outline"
        onPress={() => {
          setSeedBusy(true);
          setSeedResult(null);
          void DocumentPicker.getDocumentAsync({
            type: 'application/octet-stream',
            // The probe performs its own streaming native copy after verifying
            // the selected content URI; duplicating it into cache first can
            // require a whole-file Android allocation.
            copyToCacheDirectory: false,
          })
            .then((picked) => {
              if (picked.canceled) return null;
              return seedV7LargeMediaProductionProbe(picked.assets[0].uri);
            })
            .then((result) => setSeedResult(
              result
                ? `Seeded ${Math.round(result.byteCount / 1024 / 1024)} MiB synthetic media. ` +
                  'Return to Cloud Backup & Sync and press Sync now.'
                : 'Fixture selection cancelled.',
            ))
            .catch((caught) => setSeedResult(
              caught instanceof Error ? caught.message : 'Media probe seeding failed',
            ))
            .finally(() => setSeedBusy(false));
        }}>
        <Text>{seedBusy ? 'Preparing 200 MiB fixture…' : 'Seed v2 200 MiB production-path probe'}</Text>
      </Button>

      {seedResult && <Text className="text-muted-foreground text-xs pt-2">{seedResult}</Text>}

      <Button
        className="mt-3"
        disabled={!acknowledged || seedBusy || busy}
        variant="outline"
        onPress={() => {
          setSeedBusy(true);
          setSeedResult(null);
          void verifyV7LargeMediaProductionProbe()
            .then((result) => setSeedResult(
              result.present && result.byteCountMatched && result.sha256Matched &&
                result.productionHashMatched && result.productionByteSizeMatched
                ? `Verified restored 200 MiB fixture in ${result.elapsedMs} ms.`
                : result.present && !result.productionHashRecorded
                  ? 'The file exists, but the production engine has not recorded its hash yet.'
                  : 'The restored fixture or production hash failed verification.',
            ))
            .catch((caught) => setSeedResult(
              caught instanceof Error ? caught.message : 'Media probe verification failed',
            ))
            .finally(() => setSeedBusy(false));
        }}>
        <Text>Verify restored v2 200 MiB media</Text>
      </Button>

      {error && <Text className="text-destructive text-sm pt-3">Failed: {error}</Text>}
      {saved && (
        <Text className="text-muted-foreground text-xs pt-2">
          Redacted report saved as {V7_PHASE3_PROBE_FILENAME} in the app document directory.
        </Text>
      )}

      <ScrollView className="mt-4">
        {report?.steps.map((step) => (
          <View key={step.id} className="border-border border-t py-3">
            <Text className={`text-sm font-medium ${STATUS_CLASS[step.status]}`}>
              {step.status.toUpperCase()} — {step.title}
            </Text>
            <Text className="text-foreground text-xs pt-1">{step.detail}</Text>
            <Text className="text-muted-foreground font-mono text-xs pt-1">
              {Object.entries(step.facts)
                .map(([key, value]) => `${key}=${String(value)}`)
                .join('  ')}
            </Text>
            {step.requests?.map((request) => (
              <Text key={request.scenario} className="text-muted-foreground text-xs pt-1">
                {request.scenario}: HTTP attempts {request.attempts}; retries {request.retries};
                estimated quota units {request.estimatedQuotaUnits}.
              </Text>
            ))}
          </View>
        ))}
        <View className="h-12" />
      </ScrollView>
    </View>
  );
}
