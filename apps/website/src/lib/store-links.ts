import type { ImageMetadata } from 'astro';
import appStoreBadge from '~/assets/app-store.svg';
import galaxyStoreBadge from '~/assets/galaxy-store.svg';
import googlePlayBadge from '~/assets/google-play.svg';

export interface StoreLink {
  /** Sent with the website's `store_badge_click` analytics event. */
  id: 'google_play' | 'app_store' | 'galaxy_store';
  /** Plain store listing, for structured data. */
  url: string;
  /** The listing with a short campaign parameter, so the store consoles can
      count installs that came from the website. */
  websiteHref: string;
  badge: ImageMetadata;
  label: string;
}

const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=dev.mehra.tackbok';
const APP_STORE_URL =
  'https://apps.apple.com/us/app/tackbok-gratitude-journal/id6757330507';
// Galaxy Store links carry no parameters on purpose (#112).
const GALAXY_STORE_URL = 'https://galaxystore.samsung.com/detail/dev.mehra.tackbok';

export const storeLinks: StoreLink[] = [
  {
    id: 'google_play',
    url: GOOGLE_PLAY_URL,
    websiteHref: `${GOOGLE_PLAY_URL}&referrer=utm_source%3Dwebsite`,
    badge: googlePlayBadge,
    label: 'Get it on Google Play',
  },
  {
    id: 'app_store',
    url: APP_STORE_URL,
    websiteHref: `${APP_STORE_URL}?ct=website`,
    badge: appStoreBadge,
    label: 'Download on the App Store',
  },
  {
    id: 'galaxy_store',
    url: GALAXY_STORE_URL,
    websiteHref: GALAXY_STORE_URL,
    badge: galaxyStoreBadge,
    label: 'Available on Galaxy Store',
  },
];
