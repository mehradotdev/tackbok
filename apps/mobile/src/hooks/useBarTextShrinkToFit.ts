import { useWindowDimensions } from 'react-native';

/**
 * Whether capped bar text (see BAR_MAX_FONT_SCALE) should use `adjustsFontSizeToFit`.
 * Only above the default system text size: on Android the fit pass shrinks text by a
 * pixel or two even when it already fits, which would change the default look.
 */
export function useBarTextShrinkToFit(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale > 1;
}
