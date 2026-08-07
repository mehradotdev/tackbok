import React from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { SHARE_PALETTES, type SharePalette } from '~/lib/sharing/share-palettes';
import type { ThemeId } from '~/lib/theme';
import { TackbokLogo } from '~/components/TackbokLogo';
import { Icon } from '~/components/ui/icon';

type SharePaletteGridProps = {
  selectedId: ThemeId;
  onSelect: (palette: SharePalette) => void;
};

export function SharePaletteGrid({ selectedId, onSelect }: SharePaletteGridProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-row flex-wrap gap-3">
      {SHARE_PALETTES.map((palette) => {
        const selected = palette.id === selectedId;
        return (
          <Pressable
            key={palette.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={
              selected
                ? t('{theme} theme, selected', { theme: palette.name })
                : t('{theme} theme', { theme: palette.name })
            }
            onPress={() => onSelect(palette)}
            className="relative w-[30.5%] aspect-square rounded-lg active:opacity-70"
            style={{
              backgroundColor: palette.background,
              borderColor: selected ? palette.foreground : palette.border,
              borderWidth: selected ? 4 : 1,
            }}>
            <View className="flex-1 items-center justify-center">
              <TackbokLogo size={44} color={palette.foreground} />
            </View>
            {selected ? (
              <View
                className="absolute right-1.5 top-1.5 rounded-full p-0.5"
                style={{ backgroundColor: palette.foreground }}>
                <Icon
                  as={Check}
                  size={13}
                  color={palette.background}
                  className="size-3"
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
