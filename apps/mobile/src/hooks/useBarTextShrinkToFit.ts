import { useWindowDimensions } from 'react-native';

/**
 * Whether capped bar text (see BAR_MAX_FONT_SCALE) should stay on one line and use
 * `adjustsFontSizeToFit`. At the default size the text keeps its previous wrapping.
 * Only above the default system text size: on the Android emulator the fit pass shrank
 * the entry header text by a pixel or two at font scale 1.0 even though it already fit,
 * which changed the default look.
 */
export function useBarTextShrinkToFit(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale > 1;
}
