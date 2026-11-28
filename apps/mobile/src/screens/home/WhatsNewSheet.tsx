import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { appUpdatedThisLaunch, currentAppVersion } from '~/lib/appVersion';
import { useTranslation } from '~/lib/i18n';
import { OpeningHomeSheetView } from './OpeningHomeSheetView';
import {
  openingHomeSheetOffered,
  storeUpdateThisLaunch,
  useOpeningHomeSheet,
} from './useOpeningHomeSheet';

/** English only: the release notes live on the website, not in the catalogs. */
export const CHANGELOG_URL = 'https://tackbok.org/changelog';
/** Within Home's own settle time, mostly: the check is usually cached for a day. */
const STORE_CHECK_WAIT_MS = 2000;

/**
 * "Tackbok has been updated", once, on the first launch after an update (never
 * on a fresh install), with a link to the changelog. Offered on the opening
 * Home only, and never alongside the store update (see `useOpeningHomeSheet`).
 */
export function WhatsNewSheet({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const [due, setDue] = useState<string | null>(null);

  useEffect(() => {
    // Home renders after the settings load, so this reads the saved state.
    if (!appUpdatedThisLaunch() || openingHomeSheetOffered()) return;
    let cancelled = false;
    // A required store update goes first (this update's greeting is then
    // skipped). A slow store check doesn't hold the greeting back for long.
    void Promise.race([
      storeUpdateThisLaunch(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), STORE_CHECK_WAIT_MS),
      ),
    ]).then((update) => {
      if (!cancelled && !update?.required) setDue(currentAppVersion());
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
