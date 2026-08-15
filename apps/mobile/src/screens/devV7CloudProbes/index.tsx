import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import {
  runDriveV2RealProbe,
  V7_PHASE3_PROBE_FILENAME,
  writeDriveV2ProbeReport,
} from '~/lib/cloudSync/v2/drive/probeRunner';
import type { DriveV2ProbeReport } from '~/lib/cloudSync/v2/drive/probeReport';

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
    if ((params.run !== 'all' && params.run !== 'attach') || autoStarted.current) return;
    autoStarted.current = true;
    setAcknowledged(true);
    void run(params.run === 'attach' ? 'stored' : 'interactive');
  }, [params.run, run]);

  if (!__DEV__) {
    router.back();
    return null;
  }

  return (
    <View className="flex-1 bg-background px-safe-or-4 pt-safe-or-4">
      <Text variant="h2" className="text-foreground font-heading pb-1">
        V7-3 Drive probes
      </Text>
      <Text className="text-muted-foreground text-xs pb-3">
        This destructive suite uses only random synthetic vault data, then permanently deletes it.
        Run it only with a disposable Google test account listed on the OAuth consent screen.
      </Text>

      <View className="flex-row items-center gap-3 pb-3">
        <Switch checked={acknowledged} onCheckedChange={setAcknowledged} />
        <Text className="text-foreground text-sm flex-1">
          This device uses a disposable Google test account.
        </Text>
      </View>

      <Button
        disabled={!acknowledged || busy}
        variant="primary"
        onPress={() => void run('interactive')}>
        <Text>{busy ? 'Running destructive probes…' : 'Connect and run all probes'}</Text>
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
