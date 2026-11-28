import { useRef, type RefObject } from 'react';
import { Platform, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { useAppIconStore } from '~/lib/appIcon';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { AppIconTile } from '~/screens/settings/AppIconPickerSheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

export interface OpeningHomeSheetContent {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}

/**
 * The look shared by the opening-Home sheets (see `useOpeningHomeSheet`): the
 * current app icon, a title, one message, and two buttons.
 */
export function OpeningHomeSheetView({
  sheet,
  content,
  onDidDismiss,
}: {
  sheet: RefObject<TrueSheet | null>;
  /** Null while nothing is offered. */
  content: OpeningHomeSheetContent | null;
  onDidDismiss: () => void;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const icon = useAppIconStore((s) => s.current);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const buttons = content ? (
    <View className="bg-background w-full max-w-lg gap-2 self-center px-6 pb-2 pt-5">
      {/* Labels can wrap at large text sizes. */}
      <Button
        variant="primary"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={content.onPrimary}>
        <Text className="text-center text-lg">{content.primaryLabel}</Text>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={content.onSecondary}>
        <Text className="text-center text-lg text-foreground">
          {content.secondaryLabel}
        </Text>
      </Button>
    </View>
  ) : undefined;

  return (
    <TrueSheet
      ref={sheet}
      detents={['auto']}
      cornerRadius={sheetRadius}
      grabber
      grabberOptions={{ topMargin: 8, color: mutedFgColor as string, adaptive: false }}
      backgroundStyle={{ backgroundColor: backgroundColor as string }}
      // The buttons float in the footer, which takes the bottom inset, so they stay
      // in reach in landscape or at large text sizes; the text scrolls above them.
      scrollableRef={scrollRef}
      scrollableOptions={{ contentInsetAdjustment: 'footer' }}
      footer={buttons}
      footerOptions={{ position: 'absolute' }}
      footerStyle={{ backgroundColor: backgroundColor as string }}
      onDidDismiss={onDidDismiss}
      maxContentWidth={Platform.OS === 'android' ? 480 : undefined}>
      <ScrollView ref={scrollRef} className="bg-background">
        {content ? (
          // A readable width on iPad, where the sheet spans the page.
          <View className="w-full max-w-lg items-center self-center px-6 pt-9">
            <View
              className="pb-4"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <AppIconTile name={icon} size={84} />
            </View>
            <Text variant="h3" className="text-center text-foreground">
              {content.title}
            </Text>
            <Text className="mt-2 text-center text-base text-muted-foreground">
              {content.message}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </TrueSheet>
  );
}
