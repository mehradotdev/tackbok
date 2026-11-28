import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import { appUpdatedThisLaunch } from '~/lib/appVersion';
import { setNotNowVersion, type StoreUpdatePrompt as Prompt } from '~/lib/storeUpdate';
import { toast } from '~/components/ui/toast';
import { OpeningHomeSheetView } from './OpeningHomeSheetView';
import {
  openingHomeSheetOffered,
  storeUpdateThisLaunch,
  useOpeningHomeSheet,
} from './useOpeningHomeSheet';

/**
 * "A new version of Tackbok is available", with a button to this build's store.
 * Checked once per launch and offered on the opening Home only (see
 * `useOpeningHomeSheet`). `blocked` covers Home's own pickers.
 */
export function StoreUpdatePrompt({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const [due, setDue] = useState<Prompt | null>(null);
  const {
    sheet,
    offer: prompt,
    close,
    answer,
    onDidDismiss,
  } = useOpeningHomeSheet(due, blocked);

  useEffect(() => {
    if (openingHomeSheetOffered()) return;
    let cancelled = false;
    void storeUpdateThisLaunch().then((next) => {
      // "What's new" has the first launch after an update; an optional update
      // asks on a later launch, a required one goes first.
      if (cancelled || (next && !next.required && appUpdatedThisLaunch())) return;
      setDue(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async () => {
    if (!prompt || !answer()) return;
    const { storeUrl } = prompt;
    await close();
    await Linking.openURL(storeUrl).catch(() => {
      toast.error(t('appInfo.unableToOpenTheStore'));
    });
  };

  const notNow = () => {
    if (!prompt || !answer()) return;
    if (!prompt.required) void setNotNowVersion(prompt.latest);
    void close();
  };

  return (
    <OpeningHomeSheetView
      sheet={sheet}
      onDidDismiss={onDidDismiss}
      content={
        prompt && {
          title: t('storeUpdate.title'),
          message: prompt.required
            ? t('storeUpdate.requiredMessage', { version: prompt.latest })
            : t('storeUpdate.message', { version: prompt.latest }),
          primaryLabel: t('storeUpdate.update'),
          onPrimary: () => void update(),
          secondaryLabel: t('storeUpdate.notNow'),
          onSecondary: notNow,
        }
      }
    />
  );
}
