import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  RefreshCw,
  Share2,
  Star,
  type LucideIcon,
} from 'lucide-react-native';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { PrayingHandsIcon } from '~/components/PrayingHandsIcon';
import { SettingsSection } from '~/screens/settings/SettingsSection';
import { useTranslation } from '~/lib/i18n';
import { track } from '~/lib/analytics';
import {
  loadSupportCatalog,
  purchaseSupportTier,
  SupportPurchaseError,
} from '~/lib/purchases/revenue-cat';
import {
  mapSupportCatalog,
  type SupportCatalogTier,
} from '~/lib/purchases/support-catalog';
import { openTackbokRating, shareTackbok } from '~/lib/sharing/share-app';
import { toast } from '~/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '~/components/ui/dialog';

type PurchaseNotice =
  | { type: 'pending' }
  | { type: 'error'; message: string; tierId: SupportCatalogTier['id'] }
  | null;

function FreeSupportRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="flex"
      onPress={onPress}
      className="w-full justify-start gap-3 rounded-none border-b border-border px-4 py-4">
      <View className="size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Icon as={icon} className="text-foreground" size={20} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 items-start">
        <Text className="text-base font-body-semibold text-foreground">{title}</Text>
        <Text className="mt-0.5 text-left text-sm text-foreground">{description}</Text>
      </View>
      <View className="min-w-16 items-end">
        <Text className="text-base font-body-bold text-foreground">{t('Free')}</Text>
      </View>
    </Button>
  );
}

function SupportTierRow({
  tier,
  busy,
  loading,
  onPress,
}: {
  tier: SupportCatalogTier;
  busy: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const disabled = busy || loading || !tier.available;

  return (
    <Button
      variant="ghost"
      size="flex"
      disabled={disabled}
      onPress={onPress}
      className="w-full justify-start gap-3 rounded-none border-b border-border px-4 py-4 last:border-b-0">
      <View className="size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Icon as={Heart} className="text-foreground" size={20} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 items-start">
        <Text className="text-base font-body-semibold text-foreground">
          {t(tier.titleKey)}
        </Text>
        <Text className="mt-0.5 text-left text-sm text-foreground">
          {t(tier.descriptionKey)}
        </Text>
      </View>
      <View className="min-w-16 items-end">
        {loading ? (
          <ActivityIndicator size="small" colorClassName="accent-primary" />
        ) : (
          <Text className="text-base font-body-bold text-foreground">
            {tier.priceString ?? t('Unavailable')}
          </Text>
        )}
      </View>
    </Button>
  );
}

export default function SupportScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const [foregroundColor] = useCSSVariable(['--color-foreground']);
  const [selectedTier, setSelectedTier] = useState<SupportCatalogTier | null>(null);
  const [successfulTier, setSuccessfulTier] = useState<SupportCatalogTier | null>(null);
  const [notice, setNotice] = useState<PurchaseNotice>(null);

  const catalogQuery = useQuery({
    queryKey: ['support-catalog'],
    queryFn: loadSupportCatalog,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const catalog = useMemo(
    () => catalogQuery.data ?? mapSupportCatalog([]),
    [catalogQuery.data],
  );

  const purchaseMutation = useMutation({ mutationFn: purchaseSupportTier });
  const isPurchasing = purchaseMutation.isPending;

  const confirmPurchase = async (tier: SupportCatalogTier) => {
    setSelectedTier(null);
    setNotice(null);
    track('support_purchase_started', { tier: tier.id });

    try {
      const result = await purchaseMutation.mutateAsync(tier.id);
      if (result === 'completed') {
        track('support_purchase_completed', { tier: tier.id });
        toast.success(t('Payment successful'), {
          description: t('Thank you for supporting Tackbok. It genuinely means a lot.'),
        });
        if (process.env.EXPO_OS === 'ios') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setSuccessfulTier(tier);
      } else if (result === 'pending') {
        track('support_purchase_pending', { tier: tier.id });
        setNotice({ type: 'pending' });
      } else {
        track('support_purchase_cancelled', { tier: tier.id });
      }
    } catch (error) {
      const category = error instanceof SupportPurchaseError ? error.category : 'unknown';
      track('support_purchase_failed', { tier: tier.id, category });
      setNotice({
        type: 'error',
        tierId: tier.id,
        message:
          category === 'offline'
            ? t('You appear to be offline. Check your connection and try again.')
            : t('The purchase could not be completed. Please try again.'),
      });
    }
  };

  const handleShare = async () => {
    track('support_share_opened');
    try {
      await shareTackbok(
        t(
          'Practice gratitude with Tackbok, a simple, free, and private gratitude journaling app',
        ),
      );
    } catch {
      toast.error(t('Unknown error'));
    }
  };

  const handleRate = async () => {
    track('support_rate_opened');
    try {
      await openTackbokRating();
    } catch {
      toast.error(t('Unable to open the store'));
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center border-b border-border px-safe-or-4 pb-3 pt-safe-or-3">
        <Button
          onPress={() => router.back()}
          variant="ghost"
          className="mr-1 p-1"
          accessibilityLabel={t('Back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="py-1 font-heading text-foreground">
          {t('Support Tackbok')}
        </Text>
      </View>

      <ScrollView className="px-safe" contentContainerClassName="pb-safe-or-8 pt-6">
        <View className="mb-6 items-center px-6">
          <View className="mb-4 size-16 items-center justify-center rounded-full bg-primary/15">
            <Icon as={Heart} className="text-foreground" size={32} strokeWidth={1.8} />
          </View>
          <Text className="text-center text-base leading-6 text-foreground/80">
            {t(
              'Tackbok is free to use. If it has brought something positive to your day, you can optionally support its continued development. Support helps cover hosting, build services, and app store fees. It unlocks no features. The app works the same for everyone.',
            )}
          </Text>
        </View>

        <SettingsSection title={t('Ways to support')}>
          <FreeSupportRow
            title={t('Share Tackbok')}
            description={t('Share the app with friends and family')}
            icon={Share2}
            onPress={() => void handleShare()}
          />
          <FreeSupportRow
            title={t('Rate Tackbok')}
            description={t('Leave a rating in the app store')}
            icon={Star}
            onPress={() => void handleRate()}
          />
          {catalog.map((tier) => (
            <SupportTierRow
              key={tier.id}
              tier={tier}
              busy={isPurchasing}
              loading={catalogQuery.isLoading}
              onPress={() => setSelectedTier(tier)}
            />
          ))}
        </SettingsSection>

        {catalogQuery.isError && (
          <View className="mx-4 mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <Text className="text-sm text-foreground">
              {t('Support options could not be loaded. Please try again.')}
            </Text>
            <Button
              variant="outline"
              size="sm"
              onPress={() => void catalogQuery.refetch()}
              disabled={catalogQuery.isFetching}
              className="mt-3 self-start">
              {catalogQuery.isFetching ? (
                <ActivityIndicator size="small" colorClassName="accent-foreground" />
              ) : (
                <Icon as={RefreshCw} className="text-foreground" size={16} />
              )}
              <Text>{t('Retry')}</Text>
            </Button>
          </View>
        )}

        {notice && (
          <View
            className={
              notice.type === 'error'
                ? 'mx-4 mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4'
                : 'mx-4 mb-6 rounded-lg border border-primary/30 bg-primary/10 p-4'
            }>
            <Text className="text-sm leading-5 text-foreground">
              {notice.type === 'pending'
                ? t(
                    'Your payment is pending. The store will finish it when approval or payment completes.',
                  )
                : notice.message}
            </Text>
            {notice.type === 'error' && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPurchasing}
                onPress={() => {
                  const retryTier = catalog.find((tier) => tier.id === notice.tierId);
                  if (retryTier?.available) setSelectedTier(retryTier);
                }}
                className="mt-3 self-start">
                <Icon as={RefreshCw} className="text-foreground" size={16} />
                <Text>{t('Retry')}</Text>
              </Button>
            )}
          </View>
        )}

        <View className="mx-4 mb-6 rounded-lg border-theme border-border bg-card p-4 shadow-theme">
          <Text className="mb-2 font-body-semibold text-foreground">
            {t('Where your support helps')}
          </Text>
          <Text className="text-sm leading-5 text-foreground">
            {t(
              'The examples above reflect current costs in US dollars. Store pricing, taxes, and fees vary by country, so support is not assigned to a specific bill.',
            )}
          </Text>
        </View>
      </ScrollView>

      <AlertDialog
        open={selectedTier != null}
        onOpenChange={(open) => {
          if (!open) setSelectedTier(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Confirm {tier}', {
                tier: selectedTier ? t(selectedTier.titleKey) : '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'The store will charge {price} for this voluntary, one-time support. It unlocks no features and can be purchased again.',
                { price: selectedTier?.priceString ?? '' },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                if (selectedTier) void confirmPurchase(selectedTier);
              }}>
              <Text>{t('Continue')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={successfulTier != null}
        onOpenChange={(open) => {
          if (!open) setSuccessfulTier(null);
        }}>
        <DialogContent
          showCloseButton={false}
          className="w-[92%] max-w-sm items-center gap-5 p-6">
          <PrayingHandsIcon size={92} color={foregroundColor as string} />
          <View className="items-center gap-3">
            <DialogTitle className="text-center font-heading text-3xl leading-9">
              {t('Thank you!')}
            </DialogTitle>
            <DialogDescription className="text-center text-base leading-6 text-foreground">
              {t(
                'Your support helps keep Tackbok free and independent. It genuinely means a lot.',
              )}
            </DialogDescription>
          </View>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onPress={() => setSuccessfulTier(null)}>
            <Text>{t('Continue')}</Text>
          </Button>
        </DialogContent>
      </Dialog>
    </View>
  );
}
