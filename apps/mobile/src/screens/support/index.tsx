import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  type TextInputInstance,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import {
  ArrowLeft,
  ArrowRight,
  HandHeart,
  Heart,
  RefreshCw,
  Share2,
  Star,
  type LucideIcon,
} from 'lucide-react-native';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
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
  onPendingDonationCompleted,
  purchaseSupportTier,
  SupportPurchaseError,
} from '~/lib/purchases/revenue-cat';
import {
  DONOR_NOTE_MAX_MESSAGE_LENGTH,
  isValidDonorEmail,
  normalizeDonorNote,
  type DonorNote,
} from '~/lib/purchases/donor-note';
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
        <Text className="text-base font-body-bold text-foreground">
          {t('appInfo.free')}
        </Text>
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
            {tier.priceString ?? t('appInfo.unavailable')}
          </Text>
        )}
      </View>
    </Button>
  );
}

function CostBreakdownRow({
  label,
  amount,
  emphasized = false,
}: {
  label: string;
  amount: string;
  emphasized?: boolean;
}) {
  return (
    <View
      className={
        emphasized
          ? 'flex-row items-start justify-between gap-4 border-t border-border pt-3'
          : 'flex-row items-start justify-between gap-4'
      }>
      <Text
        className={
          emphasized
            ? 'min-w-0 flex-1 font-body-semibold text-foreground'
            : 'min-w-0 flex-1 text-sm text-foreground'
        }>
        {label}
      </Text>
      <Text
        className={
          emphasized
            ? 'shrink-0 text-right font-body-bold text-foreground'
            : 'shrink-0 text-right text-sm font-body-semibold text-foreground'
        }>
        {amount}
      </Text>
    </View>
  );
}

function DonorNoteFields({
  note,
  onChange,
  showEmailError,
  onEmailBlur,
  editable,
  emailRef,
}: {
  note: DonorNote;
  onChange: (note: DonorNote) => void;
  showEmailError: boolean;
  onEmailBlur: () => void;
  editable: boolean;
  emailRef: React.RefObject<TextInputInstance | null>;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 border-b border-border px-4 py-4">
      <View className="gap-0.5">
        <Text className="text-base font-body-semibold text-foreground">
          {t('support.note.title')}
        </Text>
        <Text className="text-sm text-foreground">{t('support.note.description')}</Text>
      </View>
      {/* Visible labels; screen readers get the same text from the fields. */}
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        className="-mb-2 text-sm font-body-medium text-foreground">
        {t('support.note.message')}
      </Text>
      <Textarea
        editable={editable}
        value={note.message}
        onChangeText={(message) => onChange({ ...note, message })}
        maxLength={DONOR_NOTE_MAX_MESSAGE_LENGTH}
        accessibilityLabel={t('support.note.message')}
        className="min-h-24 bg-background"
      />
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        className="-mb-2 text-sm font-body-medium text-foreground">
        {t('support.note.email')}
      </Text>
      <Input
        ref={emailRef}
        editable={editable}
        value={note.email}
        onChangeText={(email) => onChange({ ...note, email })}
        onBlur={onEmailBlur}
        accessibilityLabel={t('support.note.email')}
        accessibilityHint={showEmailError ? t('support.note.emailInvalid') : undefined}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={254}
        className="h-auto min-h-10"
      />
      {showEmailError && (
        // Android reads this live region; iOS gets an announcement instead.
        <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
          {t('support.note.emailInvalid')}
        </Text>
      )}
    </View>
  );
}

export default function SupportScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const [foregroundColor] = useCSSVariable(['--color-foreground']);
  const [selectedTier, setSelectedTier] = useState<SupportCatalogTier | null>(null);
  const [successfulTier, setSuccessfulTier] = useState<SupportCatalogTier | null>(null);
  const [notice, setNotice] = useState<PurchaseNotice>(null);
  // The draft stays in memory only; it is saved for sending once a purchase starts.
  const [note, setNote] = useState<DonorNote>({ message: '', email: '' });
  const [emailTouched, setEmailTouched] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const emailValid = isValidDonorEmail(note.email);
  const isAnonymous = normalizeDonorNote(note) === null;

  useEffect(
    () =>
      onPendingDonationCompleted(() => {
        setNotice((current) => (current?.type === 'pending' ? null : current));
      }),
    [],
  );

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

  const purchaseMutation = useMutation({
    mutationFn: ({
      tierId,
      note,
    }: {
      tierId: SupportCatalogTier['id'];
      note: DonorNote | null;
    }) => purchaseSupportTier(tierId, note),
  });
  const isPurchasing = purchaseMutation.isPending;

  const confirmPurchase = async (tier: SupportCatalogTier) => {
    setSelectedTier(null);
    setNotice(null);
    track('support_purchase_started', { tier: tier.id });

    try {
      const result = await purchaseMutation.mutateAsync({
        tierId: tier.id,
        note: emailValid ? normalizeDonorNote(note) : null,
      });
      if (result !== 'cancelled') {
        // The note now travels with the donation.
        setNote({ message: '', email: '' });
        setEmailTouched(false);
      }
      if (result === 'completed') {
        track('support_purchase_completed', { tier: tier.id });
        toast.success(t('appInfo.paymentSuccessful'), {
          description: t('appInfo.thankYouForSupportingTackbokItGenuinelyMeansALot'),
        });
        if (process.env.EXPO_OS === 'ios') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setSuccessfulTier(tier);
      } else if (result === 'pending') {
        track('support_purchase_pending', { tier: tier.id });
        setNotice({ type: 'pending' });
        if (process.env.EXPO_OS === 'ios') {
          AccessibilityInfo.announceForAccessibility(
            t('appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen'),
          );
        }
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
            ? t('appInfo.youAppearToBeOfflineCheckYourConnectionAndTry')
            : t('appInfo.thePurchaseCouldNotBeCompletedPleaseTryAgain'),
      });
    }
  };

  const selectTier = (tier: SupportCatalogTier) => {
    if (!emailValid) {
      setEmailTouched(true);
      // Focusing scrolls the field into view, next to its error.
      emailRef.current?.focus();
      if (process.env.EXPO_OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(t('support.note.emailInvalid'));
      }
      return;
    }
    setSelectedTier(tier);
  };

  const handleShare = async () => {
    track('support_share_opened');
    try {
      await shareTackbok(
        t('appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude'),
      );
    } catch {
      toast.error(t('common.unknownError'));
    }
  };

  const handleRate = async () => {
    track('support_rate_opened');
    try {
      await openTackbokRating();
    } catch {
      toast.error(t('appInfo.unableToOpenTheStore'));
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center border-b border-border px-safe-or-4 pb-3 pt-safe-or-3">
        <Button
          onPress={() => router.back()}
          variant="ghost"
          className="mr-1 p-1"
          accessibilityLabel={t('common.back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="py-1 font-heading text-foreground">
          {t('appInfo.supportTackbok')}
        </Text>
      </View>

      <KeyboardAwareScrollView
        className="px-safe"
        contentContainerClassName="pb-safe-or-8 pt-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={16}>
        <View className="mb-6 items-center px-6">
          <View className="mb-4 size-16 items-center justify-center rounded-full bg-primary/15">
            <Icon
              as={HandHeart}
              className="text-foreground"
              size={40}
              strokeWidth={1.8}
            />
          </View>
          <Text className="text-center text-base leading-6 text-foreground">
            {t('appInfo.tackbokIsFreeToUseAndThatsNotChangingIf')}
          </Text>
          <Text className="mt-3 text-center text-base leading-6 text-foreground">
            {t('appInfo.keepingTackbokRunningCurrentlyCostsAboutUs3325Per')}
          </Text>
        </View>

        <SettingsSection title={t('appInfo.waysToSupport')}>
          <FreeSupportRow
            title={t('appInfo.shareTackbok')}
            description={t('appInfo.shareTheAppWithFriendsAndFamily')}
            icon={Share2}
            onPress={() => void handleShare()}
          />
          <FreeSupportRow
            title={t('appInfo.rateTackbok')}
            description={t('appInfo.leaveAnHonestRatingInTheAppStore')}
            icon={Star}
            onPress={() => void handleRate()}
          />
          <DonorNoteFields
            note={note}
            onChange={setNote}
            showEmailError={emailTouched && !emailValid}
            onEmailBlur={() => {
              setEmailTouched(true);
              // VoiceOver ignores live regions; tell it about the error.
              if (!emailValid && process.env.EXPO_OS === 'ios') {
                AccessibilityInfo.announceForAccessibility(
                  t('support.note.emailInvalid'),
                );
              }
            }}
            editable={!isPurchasing}
            emailRef={emailRef}
          />
          {catalog.map((tier) => (
            <SupportTierRow
              key={tier.id}
              tier={tier}
              busy={isPurchasing}
              loading={catalogQuery.isLoading}
              onPress={() => selectTier(tier)}
            />
          ))}
        </SettingsSection>

        {catalogQuery.isError && (
          <View className="mx-4 mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <Text className="text-sm text-foreground">
              {t('appInfo.supportOptionsCouldNotBeLoadedPleaseTryAgain')}
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
              <Text>{t('common.retry')}</Text>
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
            <Text
              accessibilityLiveRegion="polite"
              className="text-sm leading-5 text-foreground">
              {notice.type === 'pending'
                ? t('appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen')
                : notice.message}
            </Text>
            {notice.type === 'error' && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPurchasing}
                onPress={() => {
                  const retryTier = catalog.find((tier) => tier.id === notice.tierId);
                  if (retryTier?.available) selectTier(retryTier);
                }}
                className="mt-3 self-start">
                <Icon as={RefreshCw} className="text-foreground" size={16} />
                <Text>{t('common.retry')}</Text>
              </Button>
            )}
          </View>
        )}

        <View className="mx-4 mb-6 rounded-lg border-theme border-border bg-card p-4 shadow-theme">
          <Text className="mb-3 font-body-semibold text-foreground">
            {t('appInfo.whereYourSupportHelps')}
          </Text>
          <View className="gap-2.5">
            <CostBreakdownRow
              label={t('appInfo.cloudflareWorkers')}
              amount={t('appInfo.us5Month')}
            />
            <CostBreakdownRow
              label={t('appInfo.expoEas')}
              amount={t('appInfo.us19Month')}
            />
            <CostBreakdownRow
              label={t('appInfo.appleDeveloperMembership')}
              amount={t('appInfo.us99Year')}
            />
            <CostBreakdownRow
              label={t('appInfo.tackbokOrgDomain')}
              amount={t('appInfo.us12Year')}
            />
            <CostBreakdownRow
              label={t('appInfo.googlePlayRegistration')}
              amount={t('appInfo.us25OneTime')}
            />
            <CostBreakdownRow
              label={t('appInfo.monthlyBaseline')}
              amount={t('appInfo.aboutUs3325')}
              emphasized
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

      <AlertDialog
        open={selectedTier != null}
        onOpenChange={(open) => {
          if (!open) setSelectedTier(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('appInfo.confirmTier', {
                tier: selectedTier ? t(selectedTier.titleKey) : '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('appInfo.theStoreWillChargePriceForThisVoluntaryOneTime', {
                price: selectedTier?.priceString ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                if (selectedTier) void confirmPurchase(selectedTier);
              }}>
              <Text>
                {isAnonymous ? t('support.donateAnonymously') : t('onboarding.continue')}
              </Text>
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
              {t('appInfo.thankYou')}
            </DialogTitle>
            <DialogDescription className="text-center text-base leading-6 text-foreground">
              {t('appInfo.yourSupportHelpsKeepTackbokFreeAndIndependentItGenuinely')}
            </DialogDescription>
          </View>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onPress={() => setSuccessfulTier(null)}>
            <Text>{t('onboarding.continue')}</Text>
          </Button>
        </DialogContent>
      </Dialog>
    </View>
  );
}
