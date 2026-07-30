import { View } from 'react-native';
import { cn } from 'tailwind-variants';
import { Text } from '~/components/ui/text';
import type { Mood } from '~/constants';

/**
 * Fixed per-mood colors for the mood heatmap ("year in pixels") and the
 * distribution bars. Theme-independent on purpose: mood is an ordinal
 * good→bad scale, and a theme's single primary color can't encode that.
 * Earthy tones picked to stay legible on both light and dark themes.
 */
export const MOOD_COLORS: Record<Mood, string> = {
  AMAZING: '#4f9d69',
  HAPPY: '#93b06a',
  OKAY: '#d4b95e',
  SAD: '#cd8f5c',
  AWFUL: '#c26a5f',
};

/** Eyebrow label shared by every section (including the card-less hero grid). */
export function InsightsSectionTitle({ title }: { title: string }) {
  return (
    <Text className="text-xs font-body-bold uppercase tracking-wider leading-relaxed text-foreground mb-2 px-1">
      {title}
    </Text>
  );
}

interface InsightsSectionProps {
  title: string;
  children: React.ReactNode;
  /** Extra classes for the inner card (e.g. drop padding for full-bleed). */
  contentClassName?: string;
}

/** Section shell — mirrors SettingsSection so the two screens feel related. */
export function InsightsSection({
  title,
  children,
  contentClassName,
}: InsightsSectionProps) {
  return (
    <View className="px-4 mb-6">
      <InsightsSectionTitle title={title} />
      <View
        className={cn(
          'bg-card rounded-lg border-theme border-border shadow-theme overflow-hidden p-4',
          contentClassName,
        )}>
        {children}
      </View>
    </View>
  );
}

/** A value + caption pair used by the hero tiles and the counts row. */
export function StatValue({
  value,
  label,
  align = 'center',
}: {
  value: string;
  label: string;
  align?: 'center' | 'start';
}) {
  return (
    <View className={align === 'center' ? 'items-center' : 'items-start'}>
      <Text className="text-2xl font-body-bold text-foreground" numberOfLines={1}>
        {value}
      </Text>
      <Text
        className="text-xs text-muted-foreground text-center mt-0.5"
        numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
