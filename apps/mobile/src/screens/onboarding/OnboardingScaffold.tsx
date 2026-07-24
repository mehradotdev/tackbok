import type { ReactNode } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

/** Welcome doesn't count: Name → Theme → Focus Areas → Privacy → Finish. */
export const ONBOARDING_STEP_COUNT = 5;

/**
 * Shared chrome for onboarding screens: safe area, top bar with back button,
 * progress dots and optional Skip, scrollable content, and a pinned footer
 * for the primary CTA.
 */
export function OnboardingScaffold({
  step,
  onSkip,
  children,
  footer,
  overlays,
  backdrop,
}: {
  /** 1-based progress position; omit on Welcome (no dots, no back). */
  step?: number;
  onSkip?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Sheets/modals — mounted outside the ScrollView, like screens do elsewhere. */
  overlays?: ReactNode;
  /** Full-screen art rendered behind everything (e.g. `<ThemeBackdrop />`). */
  backdrop?: ReactNode;
}) {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={['top', 'left', 'right', 'bottom']}>
      {backdrop}
      {/* Top bar: back / dots / skip */}
      <View className="flex-row items-center justify-between px-4 pt-1 min-h-12">
        <View className="w-16 items-start">
          {step !== undefined && (
            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.back()}
              accessibilityLabel={t('Back')}
              hitSlop={10}>
              <Icon as={BackIcon} className="text-foreground size-5" />
            </Button>
          )}
        </View>

        {step !== undefined && (
          <View
            className="flex-row items-center gap-1.5"
            accessibilityRole="progressbar"
            accessibilityLabel={t('Step {current} of {total}', {
              current: step,
              total: ONBOARDING_STEP_COUNT,
            })}>
            {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => (
              <View
                key={index}
                className={cn(
                  'h-2 rounded-full',
                  index + 1 === step ? 'w-6 bg-primary' : 'w-2 bg-foreground/20',
                )}
              />
            ))}
          </View>
        )}

        <View className="w-16 items-end">
          {onSkip && (
            <Button variant="ghost" size="sm" onPress={onSkip} hitSlop={10}>
              <Text className="text-muted-foreground">{t('Skip')}</Text>
            </Button>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow px-6 pb-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>

      {footer && <View className="px-6 pb-2 pt-2">{footer}</View>}

      {overlays}
    </SafeAreaView>
  );
}
