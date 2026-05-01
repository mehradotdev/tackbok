// This file is generated from src/lib/theme/theme-tokens.ts. Do not edit by hand.

export type TitleFontId = 'figtree' | 'lora' | 'gloriahallelujah' | 'cinzel' | 'spacemono';

export type ThemeId = 'light' | 'dark' | 'lavender' | 'forest' | 'bubblegum' | 'hecker' | 'peach' | 'ember' | 'ocean' | 'navy' | 'sakura' | 'slate' | 'kela';

export type ThemeVariant = 'light' | 'dark';

export interface TitleFontConfig {
  id: TitleFontId;
  label: string;
  fontFamily: 'Figtree_700Bold' | 'Lora_700Bold' | 'GloriaHallelujah_400Regular' | 'Cinzel_700Bold' | 'SpaceMono_700Bold';
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  variant: ThemeVariant;
  enableTimelineBorders: boolean;
  defaultTitleFontId: TitleFontId;
}

export declare const TITLE_FONTS: readonly TitleFontConfig[];
export declare const DEFAULT_THEME_ID: ThemeId;
export declare const DEFAULT_TITLE_FONT: TitleFontId;
export declare const THEMES: readonly ThemeConfig[];
export declare const THEME_IDS: readonly ThemeId[];
export declare const CUSTOM_THEME_IDS: readonly Exclude<ThemeId, 'light' | 'dark'>[];
