import React from 'react';
import { View, Text } from 'react-native';
import { TackbokLogo } from '~/components/TackbokLogo';
import type { Achievement } from '~/lib/achievements';
import { ACHIEVEMENT_SHARE_OUTPUT } from '~/lib/sharing/share-layouts';
import type { SharePalette } from '~/lib/sharing/share-palettes';
import { getTitleFontPreviewStyle } from '~/lib/theme/typography';
import { ShareCardFrame } from './share-card-frame';

type AchievementShareCardProps = {
  achievement: Achievement;
  palette: SharePalette;
  numberLabel: string;
  title: string;
  message: string;
  titleFontFamily: string;
  onReadyChange?: (ready: boolean) => void;
};

export const AchievementShareCard = React.forwardRef<View, AchievementShareCardProps>(
  function AchievementShareCard(
    { achievement, palette, numberLabel, title, message, titleFontFamily, onReadyChange },
    ref,
  ) {
    const firstReadyFrame = React.useRef<number | null>(null);
    const secondReadyFrame = React.useRef<number | null>(null);
    const hasMeasured = React.useRef(false);
    const countTextStyle = getTitleFontPreviewStyle(titleFontFamily, 88);
    const titleTextStyle = getTitleFontPreviewStyle(titleFontFamily, 29);

    const scheduleReady = React.useCallback(() => {
      firstReadyFrame.current = requestAnimationFrame(() => {
        secondReadyFrame.current = requestAnimationFrame(() => onReadyChange?.(true));
      });
    }, [onReadyChange]);

    React.useEffect(() => {
      onReadyChange?.(false);
      // The frame keeps a fixed aspect ratio, so `onLayout` only ever fires on
      // mount. Once measured, a later prop change has to reschedule the ready
      // signal itself or the card would stay not-ready forever.
      if (hasMeasured.current) scheduleReady();
      return () => {
        if (firstReadyFrame.current !== null)
          cancelAnimationFrame(firstReadyFrame.current);
        if (secondReadyFrame.current !== null)
          cancelAnimationFrame(secondReadyFrame.current);
      };
    }, [achievement.id, palette.id, titleFontFamily, onReadyChange, scheduleReady]);

    const handleLayout = React.useCallback(() => {
      hasMeasured.current = true;
      scheduleReady();
    }, [scheduleReady]);

    return (
      <ShareCardFrame
        ref={ref}
        palette={palette}
        aspectRatio={ACHIEVEMENT_SHARE_OUTPUT.aspectRatio}
        onLayout={handleLayout}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 }}>
          {achievement.variant === 'first-day' ? (
            <TackbokLogo size={82} color={palette.foreground} />
          ) : (
            <Text
              allowFontScaling={false}
              style={{
                color: palette.foreground,
                ...countTextStyle,
                lineHeight: countTextStyle.lineHeight ?? 94,
                fontVariant: ['tabular-nums'],
              }}>
              {numberLabel}
            </Text>
          )}
          <Text
            allowFontScaling={false}
            style={{
              color: palette.foreground,
              ...titleTextStyle,
              lineHeight: titleTextStyle.lineHeight ?? 34,
              textAlign: 'center',
            }}>
            {title}
          </Text>
          <Text
            allowFontScaling={false}
            style={{
              color: palette.foreground,
              fontFamily: 'Inter_400Regular',
              fontSize: 16,
              lineHeight: 22,
              textAlign: 'center',
              maxWidth: 280,
            }}>
            {message}
          </Text>
        </View>
      </ShareCardFrame>
    );
  },
);
