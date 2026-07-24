// This file is generated from src/lib/theme/theme-tokens.ts. Do not edit by hand.

export const TITLE_FONTS = [
  {
    "id": "figtree",
    "label": "Figtree",
    "fontFamily": "Figtree_700Bold"
  },
  {
    "id": "lora",
    "label": "Lora",
    "fontFamily": "Lora_700Bold"
  },
  {
    "id": "gloriahallelujah",
    "label": "Gloria Hallelujah",
    "fontFamily": "GloriaHallelujah_400Regular"
  },
  {
    "id": "cinzel",
    "label": "Cinzel",
    "fontFamily": "Cinzel_700Bold"
  },
  {
    "id": "spacemono",
    "label": "Space Mono",
    "fontFamily": "SpaceMono_700Bold"
  },
  {
    "id": "baskervville",
    "label": "Baskervville",
    "fontFamily": "Baskervville_700Bold"
  }
];

export const DEFAULT_THEME_ID = "light";
export const DEFAULT_TITLE_FONT = "figtree";

export const THEMES = [
  {
    "id": "light",
    "name": "Light",
    "description": "Warm beige/olive (DEFAULT)",
    "variant": "light",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "figtree"
  },
  {
    "id": "dark",
    "name": "Dark",
    "description": "Earthy dark (DEFAULT DARK)",
    "variant": "dark",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "figtree"
  },
  {
    "id": "lavender",
    "name": "Lavender",
    "description": "Gentle purple/lavender",
    "variant": "light",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "gloriahallelujah"
  },
  {
    "id": "bubblegum",
    "name": "Bubblegum",
    "description": "Neo-Brutalism Pop",
    "variant": "light",
    "enableTimelineBorders": true,
    "defaultTitleFontId": "spacemono"
  },
  {
    "id": "clemens",
    "name": "Clemens",
    "description": "Soft sage/botanical calm",
    "variant": "light",
    "enableTimelineBorders": false,
    "backdropId": "botanical",
    "defaultTitleFontId": "baskervville"
  },
  {
    "id": "weckner",
    "name": "Weckner",
    "description": "Forest dusk/brass lamplight",
    "variant": "dark",
    "enableTimelineBorders": false,
    "backdropId": "botanical",
    "defaultTitleFontId": "baskervville"
  },
  {
    "id": "hecker",
    "name": "Hecker",
    "description": "Cyberpunk/Retro-Futurism",
    "variant": "dark",
    "enableTimelineBorders": true,
    "defaultTitleFontId": "spacemono"
  },
  {
    "id": "peach",
    "name": "Peach",
    "description": "Warm peach/coral pastels",
    "variant": "light",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "lora"
  },
  {
    "id": "ember",
    "name": "Ember",
    "description": "Warm charcoal/amber",
    "variant": "dark",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "cinzel"
  },
  {
    "id": "ocean",
    "name": "Ocean",
    "description": "Coastal blues and sand",
    "variant": "light",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "cinzel"
  },
  {
    "id": "navy",
    "name": "Navy",
    "description": "Deep navy/slate blue",
    "variant": "dark",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "cinzel"
  },
  {
    "id": "sakura",
    "name": "Sakura",
    "description": "Soft pink/cherry blossom",
    "variant": "light",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "figtree"
  },
  {
    "id": "slate",
    "name": "Slate",
    "description": "Neutral dark monochrome",
    "variant": "dark",
    "enableTimelineBorders": false,
    "defaultTitleFontId": "gloriahallelujah"
  },
  {
    "id": "kela",
    "name": "Kela",
    "description": "Neo-Brutalism",
    "variant": "light",
    "enableTimelineBorders": true,
    "defaultTitleFontId": "spacemono"
  }
];

export const THEME_IDS = THEMES.map((theme) => theme.id);
export const CUSTOM_THEME_IDS = THEMES.filter(
  (theme) => theme.id !== "light" && theme.id !== 'dark',
).map((theme) => theme.id);
