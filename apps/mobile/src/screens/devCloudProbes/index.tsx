import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import type { DeterministicFixtureId } from '~/lib/cloudSync/phase0/deterministicFixture';
import { runConnectGroup, type ProbeEnvironment } from '~/lib/cloudSync/phase3/probeEnvironment';
import type {
  Phase3ProbeReport,
  ProbeGroupId,
  ProbeGroupResult,
  ProbeStatus,
  ProbeStep,
} from '~/lib/cloudSync/phase3/probeReport';
import {
  AUTOMATIC_GROUP_IDS,
  buildProbeReport,
  clearProbeScratch,
  PROBE_GROUPS,
  runExternalRevocationRecovery,
  runProbeSequence,
  writeProbeReport,
} from '~/lib/cloudSync/phase3/probeRunner';

const REPORT_LOCATION = 'the app document directory as phase3-probe-report.json';

const STATUS_STYLE: Record<ProbeStatus, string> = {
  passed: 'text-primary',
  failed: 'text-destructive',
  inconclusive: 'text-destructive',
  skipped: 'text-muted-foreground',
  'awaiting-operator': 'text-foreground',
};

function StepRow({
  step,
  onResolve,
}: {
  step: ProbeStep;
  onResolve: (stepId: string, status: ProbeStatus) => void;
}) {
  const facts = Object.entries(step.facts);
  return (
    <View className="border-border border-t py-2">
      <Text className={`text-sm font-medium ${STATUS_STYLE[step.status]}`}>
        {step.status.toUpperCase()} — {step.title}
      </Text>
      <Text className="text-foreground text-xs pt-1">{step.detail}</Text>
      {facts.length > 0 && (
        <Text className="text-muted-foreground font-mono text-xs pt-1">
          {facts.map(([key, value]) => `${key}=${String(value)}`).join('  ')}
        </Text>
      )}
      {step.operatorPrompt && (
        <View className="pt-2">
          <Text className="text-foreground text-xs">{step.operatorPrompt}</Text>
          {step.status === 'awaiting-operator' && (
            <View className="flex-row gap-2 pt-2">
              <Button size="sm" variant="primary" onPress={() => onResolve(step.id, 'passed')}>
                <Text>Confirmed</Text>
              </Button>
              <Button size="sm" variant="destructive" onPress={() => onResolve(step.id, 'failed')}>
                <Text>Not as described</Text>
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Development-only Phase-3 owner probe runner. Not linked from any production
 * screen; reached via the dev-cloud-probes route.
 *
 * The probes write to and permanently delete objects in the signed-in account's
 * Drive appDataFolder, so the screen refuses to do anything until the operator
 * declares the account disposable. Groups run one at a time because several of
 * them depend on an action taken outside the app.
 */
export default function DevCloudProbesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    run?: string;
    fixture?: string;
    mode?: string;
    stage?: string;
  }>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [fixtureId, setFixtureId] = useState<DeterministicFixtureId>('quick-32mib');
  const [busy, setBusy] = useState<string | null>(null);
  const [groups, setGroups] = useState<ProbeGroupResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [env, setEnv] = useState<ProbeEnvironment | null>(null);
  const autoRunStarted = useRef(false);

  const vaultId = env?.vault.vaultId ?? null;
  const report: Phase3ProbeReport | null = useMemo(
    () => (vaultId && groups.length > 0 ? buildProbeReport(vaultId, groups) : null),
    [vaultId, groups],
  );

  const mergeGroup = useCallback((result: ProbeGroupResult) => {
    setGroups((current) => [...current.filter((group) => group.id !== result.id), result]);
  }, []);

  const guard = useCallback(
    async (label: string, body: () => Promise<void>) => {
      setBusy(label);
      setError(null);
      setSavedTo(null);
      try {
        await body();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const connect = useCallback(
    () =>
      guard('connect', async () => {
        const { group, env: connected } = await runConnectGroup();
        setEnv(connected);
        mergeGroup(group);
      }),
    [guard, mergeGroup],
  );

  const runGroup = useCallback(
    (id: string) =>
      guard(id, async () => {
        if (!env) throw new Error('Connect before running probe groups');
        const definition = PROBE_GROUPS.find((group) => group.id === id);
        if (!definition) throw new Error(`Unknown probe group ${id}`);
        mergeGroup(await definition.run(env, { fixtureId }));
      }),
    [guard, mergeGroup, fixtureId, env],
  );

  const recover = useCallback(
    () =>
      guard('recover', async () => {
        if (!env) throw new Error('Connect before running probe groups');
        mergeGroup(await runExternalRevocationRecovery(env));
      }),
    [guard, mergeGroup, env],
  );

  const resolveStep = useCallback((stepId: string, status: ProbeStatus) => {
    setGroups((current) =>
      current.map((group) => {
        if (!group.steps.some((step) => step.id === stepId)) return group;
        return {
          ...group,
          steps: group.steps.map((step) => (step.id === stepId ? { ...step, status } : step)),
        };
      }),
    );
  }, []);

  const save = useCallback(
    () =>
      guard('save', async () => {
        if (!report) throw new Error('Nothing to save yet');
        setSavedTo(await writeProbeReport(report));
      }),
    [guard, report],
  );

  /**
   * Deep-link driven pass: `?run=all` runs every group that needs nothing done
   * outside the app, `?run=a,b` runs named groups — including the two that need
   * staging, since naming one is itself a statement that it was staged.
   * `?mode=attach` reuses stored credentials instead of granting consent, and
   * `?stage=recover` selects the recovery half of the revocation leg. The
   * report is written and logged at the end, so a pass can be triggered and
   * harvested without tapping through the screen.
   */
  useEffect(() => {
    const requested = params.run;
    if (!requested || autoRunStarted.current) return;
    autoRunStarted.current = true;

    const fixture: DeterministicFixtureId =
      params.fixture === 'full-200mib' ? 'full-200mib' : 'quick-32mib';
    const known = PROBE_GROUPS.map((definition) => definition.id);
    const groupIds =
      requested === 'all'
        ? AUTOMATIC_GROUP_IDS
        : (requested.split(',').filter((id) => known.includes(id as ProbeGroupId)) as ProbeGroupId[]);

    setAcknowledged(true);
    setFixtureId(fixture);
    void guard('auto-run', async () => {
      await runProbeSequence({
        groupIds,
        fixtureId: fixture,
        mode: params.mode === 'attach' ? 'attach' : 'connect',
        stage: params.stage === 'recover' ? 'recover' : 'observe-failure',
        onEnvironment: setEnv,
        onGroup: mergeGroup,
      });
    });
  }, [params.run, params.fixture, params.mode, params.stage, guard, mergeGroup]);

  if (!__DEV__) {
    router.back();
    return null;
  }

  return (
    <View className="flex-1 bg-background pt-safe-or-4 px-safe-or-4">
      <Text variant="h2" className="text-foreground font-heading pb-1">
        Phase-3 owner probes
      </Text>
      <Text className="text-muted-foreground text-xs pb-3">
        These probes create and permanently delete objects in the signed-in account&apos;s Drive
        app data. Use a disposable test account listed on the OAuth consent screen. Never sign in
        with a personal account.
      </Text>

      <View className="flex-row items-center gap-3 pb-3">
        <Switch checked={acknowledged} onCheckedChange={setAcknowledged} />
        <Text className="text-foreground text-sm flex-1">
          This device is signed into a disposable Google test account.
        </Text>
      </View>

      <ScrollView>
        <View className="flex-row gap-2 pb-3">
          <Button
            variant={fixtureId === 'quick-32mib' ? 'primary' : 'outline'}
            size="sm"
            onPress={() => setFixtureId('quick-32mib')}>
            <Text>32 MiB</Text>
          </Button>
          <Button
            variant={fixtureId === 'full-200mib' ? 'primary' : 'outline'}
            size="sm"
            onPress={() => setFixtureId('full-200mib')}>
            <Text>200 MiB (gate)</Text>
          </Button>
        </View>

        <Button
          disabled={!acknowledged || busy !== null}
          onPress={() => void connect()}
          variant="primary">
          <Text>{env ? 'Reconnect' : 'Connect and create probe vault'}</Text>
        </Button>
        {vaultId && (
          <Text className="text-muted-foreground font-mono text-xs pt-2">
            vault {vaultId} · account {env?.accountLabel}
          </Text>
        )}

        {error && <Text className="text-destructive text-sm pt-3">Failed: {error}</Text>}

        <View className="h-4" />

        {PROBE_GROUPS.map((definition) => {
          const result = groups.find((group) => group.id === definition.id);
          return (
            <View key={definition.id} className="border-border border-t py-3">
              <Text className="text-foreground text-sm font-medium">{definition.title}</Text>
              <Text className="text-muted-foreground text-xs pt-1">{definition.summary}</Text>
              <Text className="text-muted-foreground text-xs pt-1">Gate: {definition.gateItem}</Text>
              {definition.manualStaging && (
                <Text className="text-foreground text-xs pt-1">
                  Before running: {definition.manualStaging}
                </Text>
              )}
              <View className="flex-row gap-2 pt-2">
                <Button
                  size="sm"
                  disabled={!acknowledged || busy !== null || !env}
                  onPress={() => void runGroup(definition.id)}>
                  <Text>{busy === definition.id ? 'Running…' : 'Run'}</Text>
                </Button>
                {definition.id === 'external-revocation' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!acknowledged || busy !== null || !env}
                    onPress={() => void recover()}>
                    <Text>Recover</Text>
                  </Button>
                )}
              </View>
              {result?.steps.map((step) => (
                <StepRow key={step.id} step={step} onResolve={resolveStep} />
              ))}
            </View>
          );
        })}

        <View className="h-4" />
        <Button variant="primary" disabled={!report || busy !== null} onPress={() => void save()}>
          <Text>Save redacted report</Text>
        </Button>
        {savedTo && (
          <Text className="text-muted-foreground text-xs pt-2">
            Written to {REPORT_LOCATION}. Also printed to the log.
          </Text>
        )}
        <View className="h-2" />
        <Button variant="outline" disabled={busy !== null} onPress={() => clearProbeScratch()}>
          <Text>Delete local fixture files</Text>
        </Button>

        {report && (
          <>
            <View className="h-4" />
            <Text className="text-foreground font-mono text-xs">
              {JSON.stringify(report, null, 2)}
            </Text>
          </>
        )}
        <View className="h-12" />
      </ScrollView>
    </View>
  );
}
