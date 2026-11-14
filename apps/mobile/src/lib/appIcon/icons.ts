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

/**
 * Beta builds use the Blueprint artwork as their default icon, so the Classic
 * artwork is an extra alternate there (also a native identifier).
 */
export const BETA_ALTERNATE_APP_ICONS = [...ALTERNATE_APP_ICONS, 'Classic'] as const;

/** Every icon artwork; the picker offers each one in every build. */
export type AppIconName = (typeof BETA_ALTERNATE_APP_ICONS)[number];
