import { useState } from 'react';
import { Linking } from 'react-native';
import { appUpdatedThisLaunch, currentAppVersion } from '~/lib/appVersion';
import { useTranslation } from '~/lib/i18n';
import { OpeningHomeSheetView } from './OpeningHomeSheetView';
import { useOpeningHomeSheet } from './useOpeningHomeSheet';

/** English only: the release notes live on the website, not in the catalogs. */
export const CHANGELOG_URL = 'https://tackbok.org/changelog';

/**
 * "Tackbok has been updated", once, on the first launch after an update (never
 * on a fresh install), with a link to the changelog. Offered on the opening
 * Home only, and never alongside the store update (see `useOpeningHomeSheet`).
 */
export function WhatsNewSheet({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  // Home renders after the settings load, so this reads the saved state.
  const [due] = useState(() => (appUpdatedThisLaunch() ? currentAppVersion() : null));
  const {
    sheet,
    offer: version,
    close,
    answer,
    onDidDismiss,
  } = useOpeningHomeSheet(due, blocked);

  const seeWhatsNew = async () => {
    if (!answer()) return;
    await close();
    await Linking.openURL(CHANGELOG_URL).catch(() => {});
  };

  const dismiss = () => {
    if (!answer()) return;
    void close();
  };

  return (
    <OpeningHomeSheetView
      sheet={sheet}
      onDidDismiss={onDidDismiss}
      content={
        version === null
          ? null
          : {
              title: t('whatsNew.title'),
              message: t('whatsNew.message', { version }),
              primaryLabel: t('whatsNew.seeWhatsNew'),
              onPrimary: () => void seeWhatsNew(),
              secondaryLabel: t('common.close'),
              onSecondary: dismiss,
            }
      }
    />
  );
}
