// Plain data: app.config.ts reads this to register the native icons.

/**
 * Alternate launcher icons, in picker order. Each name is a native identifier
 * (iOS icon set and Android activity-alias), so never rename one. Artwork lives
 * in assets/icons/alternate/<lowercase name>/ and the in-app preview in
 * assets/images/app-icons/. Names double as the picker labels.
 */
export const ALTERNATE_APP_ICONS = [
  'Sage',
  'Midnight',
  'Ocean',
  'Terracotta',
  'Rose',
  'Plum',
  'Blueprint',
] as const;

export type AlternateAppIconName = (typeof ALTERNATE_APP_ICONS)[number];

/** Picker label for the bundled default icon. */
export const DEFAULT_APP_ICON_LABEL = 'Classic';
