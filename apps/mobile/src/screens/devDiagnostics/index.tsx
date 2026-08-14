import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import type { DeterministicFixtureId } from '~/lib/cloudSync/phase0/deterministicFixture';
import {
  runPhase0Diagnostics,
  type Phase0DiagnosticsReport,
} from '~/lib/cloudSync/phase0/diagnosticsRunner';
import {
  runV7CanonicalDeviceProbe,
  type V7CanonicalDeviceReport,
} from '~/lib/cloudSync/v2/deviceProbe';

type RunState =
  | { status: 'idle' }
  | { status: 'running'; fixtureId: DeterministicFixtureId }
  | { status: 'done'; report: Phase0DiagnosticsReport | V7CanonicalDeviceReport }
  | { status: 'error'; message: string };

/**
 * Development-only Phase-0 diagnostics runner. Not linked from any production
 * screen; reached via the dev-diagnostics route (optionally with
 * ?fixture=quick-32mib). Auto-runs on mount so the probes can be driven
 * headlessly through a deep link.
 */
export default function DevDiagnosticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fixture?: string; suite?: string }>();
  const [runState, setRunState] = useState<RunState>({ status: 'idle' });
  const startedRef = useRef(false);

  const fixtureId: DeterministicFixtureId =
    params.fixture === 'quick-32mib' ? 'quick-32mib' : 'full-200mib';
  const isV7Canonical = params.suite === 'v7-canonical';

  const run = useCallback(async () => {
    setRunState({ status: 'running', fixtureId });
    try {
      const report = isV7Canonical
        ? runV7CanonicalDeviceProbe()
        : await runPhase0Diagnostics(fixtureId);
      setRunState({ status: 'done', report });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`PHASE0_DIAGNOSTICS_ERROR ${message}`);
      setRunState({ status: 'error', message });
    }
  }, [fixtureId, isV7Canonical]);

  useEffect(() => {
    if (!__DEV__) {
      router.back();
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      void run();
    }
  }, [router, run]);

  if (!__DEV__) {
    return null;
  }

  return (
    <View className="flex-1 bg-background pt-safe-or-4 px-safe-or-4">
      <Text variant="h2" className="text-foreground font-heading pb-2">
        {isV7Canonical ? 'V7 canonical diagnostics' : 'Phase-0 diagnostics'}
      </Text>
      <ScrollView>
        {runState.status === 'idle' && <Text className="text-foreground">Idle.</Text>}
        {runState.status === 'running' && (
          <Text className="text-foreground">
            {isV7Canonical ? 'Running canonical fixtures…' : `Running probes (${runState.fixtureId})…`}
          </Text>
        )}
        {runState.status === 'error' && (
          <Text className="text-destructive">Failed: {runState.message}</Text>
        )}
        {runState.status === 'done' && (
          <Text className="text-foreground font-mono text-xs">
            {JSON.stringify(runState.report, null, 2)}
          </Text>
        )}
        <View className="h-4" />
        <Button onPress={() => void run()} disabled={runState.status === 'running'}>
          <Text>Run again</Text>
        </Button>
        <View className="h-8" />
      </ScrollView>
    </View>
  );
}
