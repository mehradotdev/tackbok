import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, View } from 'react-native';
import { Text } from '~/components/ui/text';
import { useTranslation } from '~/lib/i18n';
import type { CloudSyncSnapshot, SyncProgress } from '~/lib/cloudSync/ui';
import {
  syncPhaseLabel,
  syncProgressDetail,
  syncProgressFinishing,
  syncProgressLabel,
  syncProgressOverall,
  syncWaitMessage,
} from './copy';

/** Fraction of the current step, from bytes when known, else items. */
function stepFraction(progress: SyncProgress | null): number | null {
  const count = progress?.bytes ?? progress?.items;
  if (!count || count.total <= 0) return null;
  return Math.min(1, count.done / count.total);
}

/** The current time, refreshed every second while a wait with a known end is shown. */
function useCountdownNow(until: number | undefined): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (until === undefined) return;
    const update = () => setNow(Date.now());
    // Tick at once: a new wait must not count from an earlier wait's time.
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  return now;
}

export function SyncStatusLine({
  phase,
  initialRestore,
  progress,
}: {
  phase: NonNullable<CloudSyncSnapshot['activityPhase']>;
  initialRestore: boolean;
  progress: SyncProgress | null;
}) {
  const { t, locale } = useTranslation();
  const now = useCountdownNow(progress?.waiting?.until);
  const label = progress
    ? syncProgressLabel(progress.phase, initialRestore, t)
    : syncPhaseLabel(phase, initialRestore, t);
  const detail = progress ? syncProgressDetail(progress, locale, t) : null;
  const wait = progress?.waiting ? syncWaitMessage(progress.waiting, now, t) : null;
  // A bar only when the current step has a known total; a wait pauses it.
  const fraction = wait ? null : stepFraction(progress);
  const percent = fraction === null ? null : Math.round(fraction * 100);
  const finishing =
    progress && fraction === 1 ? syncProgressFinishing(progress.phase, t) : null;
  // Announce a wait when it starts or its reason changes, never each second.
  const waitReason = progress?.waiting?.reason ?? null;
  const announcedWait = useRef<string | null>(null);
  useEffect(() => {
    if (waitReason === announcedWait.current) return;
    announcedWait.current = waitReason;
    if (wait) AccessibilityInfo.announceForAccessibility(wait);
  }, [waitReason, wait]);

  return (
    <View
      className="gap-2 rounded-xl bg-primary/10 p-3"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        percent === null ? { text: wait ?? label } : { min: 0, max: 100, now: percent }
      }>
      <View className="flex-row items-center gap-3">
        {percent === null && (
          <ActivityIndicator size="small" colorClassName="accent-primary" />
        )}
        <Text
          className="flex-1 font-body-semibold text-foreground"
          accessibilityLiveRegion="polite">
          {label}
        </Text>
      </View>
      {detail && <Text className="text-sm text-foreground">{detail}</Text>}
      {percent !== null && (
        <View className="h-1.5 overflow-hidden rounded-full bg-primary/20">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${percent}%` }}
          />
        </View>
      )}
      {finishing && <Text className="text-sm text-foreground">{finishing}</Text>}
      {wait && <Text className="text-sm text-foreground">{wait}</Text>}
      {progress && (
        <Text className="text-xs leading-4.5 text-foreground">
          {syncProgressOverall(progress, t)}
        </Text>
      )}
      <Text className="text-xs leading-4.5 text-foreground">
        {t('cloud.syncIsFasterWithTackbokOpen')}
      </Text>
    </View>
  );
}
