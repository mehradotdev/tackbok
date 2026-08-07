import React from 'react';
import { View, Text, type ViewStyle } from 'react-native';
import { TackbokLogo } from '~/components/TackbokLogo';
import type { SharePalette } from '~/lib/sharing/share-palettes';

type ShareCardFrameProps = {
  palette: SharePalette;
  aspectRatio: number;
  children: React.ReactNode;
  onLayout?: React.ComponentProps<typeof View>['onLayout'];
};

export const ShareCardFrame = React.forwardRef<View, ShareCardFrameProps>(
  function ShareCardFrame({ palette, aspectRatio, children, onLayout }, ref) {
    const frameStyle: ViewStyle = {
      width: '100%',
      aspectRatio,
      overflow: 'hidden',
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderWidth: 1,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 6,
    };

    return (
      <View ref={ref} collapsable={false} onLayout={onLayout} style={frameStyle}>
        <View style={{ flex: 1 }}>{children}</View>
        <View
          style={{
            borderTopColor: palette.border,
            borderTopWidth: 1,
            paddingTop: 6,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}>
          <TackbokLogo size={15} color={palette.foreground} />
          <Text
            allowFontScaling={false}
            style={{
              color: palette.foreground,
              fontFamily: 'Figtree_700Bold',
              fontSize: 12,
              letterSpacing: 0.5,
            }}>
            Tackbok
          </Text>
        </View>
      </View>
    );
  },
);
