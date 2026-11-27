// This file is generated from src/lib/theme/theme-tokens.ts. Do not edit by hand.

export type TitleFontId = 'figtree' | 'lora' | 'gloriahallelujah' | 'cinzel' | 'spacemono' | 'baskervville' | 'bagelfatone';

export type ThemeId = 'light' | 'dark' | 'shiro' | 'shadow' | 'helena' | 'poonam' | 'clemens' | 'bea' | 'camino' | 'camino-night' | 'denise' | 'giuseppe' | 'kristen' | 'higa' | 'pine-night' | 'velvet' | 'bubblegum' | 'hecker' | 'peach' | 'ember' | 'ocean' | 'naini' | 'sakura' | 'slate' | 'kela' | 'lavender';

export type ThemeVariant = 'light' | 'dark';

export type BackdropId = 'shiro' | 'shadow' | 'helena' | 'poonam' | 'botanical' | 'camino' | 'camino-night' | 'denise' | 'giuseppe' | 'kristen' | 'higa' | 'pine-night' | 'velvet';

export interface TitleFontConfig {
  id: TitleFontId;
  label: string;
  fontFamily: 'Figtree_700Bold' | 'Lora_700Bold' | 'GloriaHallelujah_400Regular' | 'Cinzel_700Bold' | 'SpaceMono_700Bold' | 'Baskervville_700Bold' | 'BagelFatOne_400Regular';
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  variant: ThemeVariant;
  enableTimelineBorders: boolean;
  backdropId?: BackdropId;
  defaultTitleFontId: TitleFontId;
}

export declare const TITLE_FONTS: readonly TitleFontConfig[];
export declare const DEFAULT_THEME_ID: ThemeId;
export declare const DEFAULT_TITLE_FONT: TitleFontId;
export declare const THEMES: readonly ThemeConfig[];
export declare const THEME_IDS: readonly ThemeId[];
export declare const CUSTOM_THEME_IDS: readonly Exclude<ThemeId, 'light' | 'dark'>[];
