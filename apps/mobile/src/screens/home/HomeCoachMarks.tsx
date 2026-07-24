import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { useEntriesGroupByDate } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

type CoachMark = {
  key: string;
  text: string;
  /** Uniwind classes positioning the bubble inside the overlay. */
  positionClassName: string;
};

/**
 * One-time tooltip walkthrough on the first Home render after onboarding.
 * Deliberately dependency-free: a dim overlay with positioned bubbles rather
 * than a measured-anchor walkthrough library. Tapping anywhere advances;
 * "Skip" ends it; it never shows again (`hasSeenHomeCoachMarks`).
 *
 * Screen-reader users skip it entirely — an overlay sequence communicated by
 * position is noise for them.
 */
export function HomeCoachMarks() {
  const { t } = useTranslation();
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  const hasSeenHomeCoachMarks = useSettingsStore((s) => s.hasSeenHomeCoachMarks);
  const setHasSeenHomeCoachMarks = useSettingsStore((s) => s.setHasSeenHomeCoachMarks);
  const sampleEntryIds = useSettingsStore((s) => s.sampleEntryIds);
  const { data: entriesByDate, isPending: entriesArePending } =
    useEntriesGroupByDate();
  const [stepIndex, setStepIndex] = useState(0);

  const isActive =
    hasCompletedOnboarding && !hasSeenHomeCoachMarks && !entriesArePending;
  const hasEntries = Boolean(entriesByDate?.size) || sampleEntryIds.length > 0;

  useEffect(() => {
    if (!isActive) return;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (enabled) setHasSeenHomeCoachMarks(true);
    });
  }, [isActive, setHasSeenHomeCoachMarks]);

  if (!isActive) return null;

  const marks: CoachMark[] = [
    // Written for LTR; React Native's RTL left/right swap mirrors these
    // automatically under forceRTL, matching the mirrored targets.
    {
      key: 'add-entry',
      text: t('Add today’s entry here.'),
      positionClassName: 'bottom-32 right-4',
    },
    {
      key: 'move-dock',
      text: t('Press and hold, then drag to move these buttons along the edge.'),
      positionClassName: 'bottom-32 right-4',
    },
    ...(hasEntries
      ? [
          {
            key: 'entry-card',
            text: t('Tap an entry to view or edit it.'),
            positionClassName: 'top-36 left-6',
          },
        ]
      : []),
    {
      key: 'search',
      text: t('Find memories by text or tag.'),
      positionClassName: 'top-16 left-3',
    },
  ];

  const mark = marks[stepIndex];
  const isLastStep = stepIndex === marks.length - 1;

  const handleAdvance = () => {
    if (isLastStep) {
      setHasSeenHomeCoachMarks(true);
    } else {
      setStepIndex((prev) => prev + 1);
    }
  };

  return (
    <Pressable
      className="absolute inset-0 z-50 bg-black/60"
      onPress={handleAdvance}
      accessibilityViewIsModal
      accessibilityLabel={mark.text}>
      <View
        className={cn(
          'absolute bg-card border border-border rounded-lg p-3 max-w-65 shadow-theme',
          mark.positionClassName,
        )}>
        <Text className="text-base text-foreground">{mark.text}</Text>
        <View className="flex-row items-center justify-between mt-2 gap-3">
          <Text className="text-xs text-muted-foreground">
            {`${stepIndex + 1} / ${marks.length}`}
          </Text>
          <View className="flex-row gap-2">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setHasSeenHomeCoachMarks(true)}>
              <Text className="text-sm text-muted-foreground">{t('Skip')}</Text>
            </Button>
            <Button variant="primary" size="sm" onPress={handleAdvance}>
              <Text className="text-sm">{isLastStep ? t('Done') : t('Next')}</Text>
            </Button>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
