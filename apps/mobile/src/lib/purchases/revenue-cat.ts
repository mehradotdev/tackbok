import { Platform } from 'react-native';
import Constants from 'expo-constants';
// Type augmentation only: Google/iOS builds do not link the Galaxy native module.
import type {} from 'react-native-purchases-store-galaxy';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';
import {
  mapSupportCatalog,
  SUPPORT_OFFERING_ID,
  type SupportCatalogTier,
  type SupportTierId,
} from './support-catalog';
import { sendDonorNote, type DonorNote } from './donor-note';
import {
  matchCompletedDonations,
  readFollowUps,
  updateFollowUps,
  type DonationFollowUp,
} from './donation-follow-ups';
import { withExternalAuthentication } from '~/lib/externalAuthentication';

export type SupportPurchaseErrorCategory =
  | 'offline'
  | 'configuration'
  | 'store'
  | 'not_allowed'
  | 'unknown';

export class SupportPurchaseError extends Error {
  constructor(
    public readonly category: SupportPurchaseErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'SupportPurchaseError';
  }
}

export type SupportPurchaseResult = 'completed' | 'cancelled' | 'pending';

let configurationPromise: Promise<void> | null = null;
let packagesByTier = new Map<SupportTierId, PurchasesPackage>();

function isGalaxyStore(): boolean {
  return (
    Platform.OS === 'android' && Constants.expoConfig?.extra?.androidStore === 'samsung'
  );
}

function getRevenueCatApiKey(): string | undefined {
  // Galaxy TEST mode exercises Samsung IAP, not RevenueCat's simulated Test Store.
  if (isGalaxyStore()) return process.env.EXPO_PUBLIC_REVENUECAT_GALAXY_API_KEY;
  const appVariant = Constants.expoConfig?.extra?.appVariant;
  const isTestBuild = appVariant === 'beta' || __DEV__;
  if (isTestBuild) return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;

  const platform = Platform.OS;
  if (platform === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (platform === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  }
  return undefined;
}

export function initializeRevenueCat(): Promise<void> {
  if (configurationPromise) return configurationPromise;

  configurationPromise = (async () => {
    const platform = Platform.OS;
    if (platform !== 'ios' && platform !== 'android') {
      throw new SupportPurchaseError(
        'configuration',
        'RevenueCat purchases are only available on iOS and Android.',
      );
    }

    const apiKey = getRevenueCatApiKey();
    if (!apiKey) {
      throw new SupportPurchaseError(
        'configuration',
        'The RevenueCat API key is missing for this build.',
      );
    }

    if (!(await Purchases.isConfigured())) {
      if (isGalaxyStore()) {
        const mode = Constants.expoConfig?.extra?.galaxyBillingMode ?? 'PRODUCTION';
        if (mode !== 'PRODUCTION' && mode !== 'TEST') {
          throw new SupportPurchaseError('configuration', 'Invalid Galaxy billing mode.');
        }
        Purchases.configure({ apiKey, store: 'GALAXY', galaxyBillingMode: mode });
      } else {
        Purchases.configure({ apiKey });
      }
      if (__DEV__) await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }
  })().catch((error) => {
    // A missing key can be fixed by a fresh development reload without leaving
    // this module permanently stuck with the first rejected promise.
    configurationPromise = null;
    throw error;
  });

  return configurationPromise;
}

export async function loadSupportCatalog(): Promise<SupportCatalogTier[]> {
  await initializeRevenueCat();
  const offerings = await Purchases.getOfferings();
  const offering =
    offerings.current?.identifier === SUPPORT_OFFERING_ID
      ? offerings.current
      : offerings.all[SUPPORT_OFFERING_ID];

  if (!offering) {
    throw new SupportPurchaseError(
      'configuration',
      `RevenueCat offering "${SUPPORT_OFFERING_ID}" is unavailable.`,
    );
  }

  const packageSnapshots = offering.availablePackages.map((item) => ({
    packageId: item.identifier,
    productId: item.product.identifier,
    priceString: item.product.priceString,
  }));
  const catalog = mapSupportCatalog(packageSnapshots);

  packagesByTier = new Map();
  for (const tier of catalog) {
    if (!tier.available) continue;
    const revenueCatPackage = offering.availablePackages.find(
      (item) => item.identifier === tier.packageId,
    );
    if (revenueCatPackage) packagesByTier.set(tier.id, revenueCatPackage);
  }

  return catalog;
}

function isPurchasesError(error: unknown): error is PurchasesError {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string',
  );
}

function classifyPurchasesError(
  code: PURCHASES_ERROR_CODE,
): SupportPurchaseErrorCategory {
  if (
    code === PURCHASES_ERROR_CODE.NETWORK_ERROR ||
    code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR ||
    code === PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR
  ) {
    return 'offline';
  }
  if (
    code === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR ||
    code === PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR ||
    code === PURCHASES_ERROR_CODE.UNSUPPORTED_ERROR
  ) {
    return 'configuration';
  }
  if (
    code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR ||
    code === PURCHASES_ERROR_CODE.INSUFFICIENT_PERMISSIONS_ERROR
  ) {
    return 'not_allowed';
  }
  if (
    code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR ||
    code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR ||
    code === PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR
  ) {
    return 'store';
  }
  return 'unknown';
}

// While a purchase call is running, its own customer-info update must not be
// mistaken for a pending donation completing.
let purchasesInFlight = 0;

async function knownTransactionIds(productId: string): Promise<string[]> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.nonSubscriptionTransactions
      .filter((transaction) => transaction.productIdentifier === productId)
      .map((transaction) => transaction.transactionIdentifier);
  } catch {
    // Without a baseline, matching falls back to the purchase date.
    return [];
  }
}

/** A purchase that completed right away must not complete an older pending one. */
async function excludeFromPendingDonations(transactionId: string): Promise<void> {
  try {
    await updateFollowUps((records) => ({
      records: records.map((record) =>
        record.transactionId === null
          ? {
              ...record,
              knownTransactionIds: [...record.knownTransactionIds, transactionId],
            }
          : record,
      ),
      result: undefined,
    }));
  } catch {
    // Best effort; see saveFollowUp.
  }
}

async function saveFollowUp(record: DonationFollowUp): Promise<void> {
  try {
    await updateFollowUps((records) => ({
      records: [...records, record],
      result: undefined,
    }));
  } catch {
    // Storage failures must not turn a successful payment into an error.
  }
}

/**
 * Starts a donation. `note` is the donor's optional message and email, already
 * normalized; it is sent only once the store reports the payment as completed,
 * either right away or later for a pending payment.
 */
export async function purchaseSupportTier(
  tierId: SupportTierId,
  note: DonorNote | null = null,
): Promise<SupportPurchaseResult> {
  await initializeRevenueCat();
  const revenueCatPackage = packagesByTier.get(tierId);
  if (!revenueCatPackage) {
    throw new SupportPurchaseError(
      'configuration',
      'This support option is not currently available.',
    );
  }

  return withExternalAuthentication(async () => {
    const productId = revenueCatPackage.product.identifier;
    const createdAt = Date.now();
    const baseline = await knownTransactionIds(productId);
    const followUp = (transactionId: string | null): DonationFollowUp => ({
      id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
      tierId,
      productId,
      createdAt,
      transactionId,
      knownTransactionIds: baseline,
      note,
    });

    purchasesInFlight += 1;
    try {
      const result = await Purchases.purchasePackage(revenueCatPackage);
      const transactionId = result?.transaction?.transactionIdentifier ?? null;
      if (transactionId) await excludeFromPendingDonations(transactionId);
      if (note) {
        await saveFollowUp(followUp(transactionId));
        void sendReadyDonorNotes();
      }
      return 'completed';
    } catch (error) {
      if (isPurchasesError(error)) {
        if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
          return 'cancelled';
        }
        if (error.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
          await saveFollowUp(followUp(null));
          watchCustomerInfo();
          return 'pending';
        }
        throw new SupportPurchaseError(classifyPurchasesError(error.code), error.message);
      }
      throw new SupportPurchaseError('unknown', 'The purchase could not be completed.');
    } finally {
      purchasesInFlight -= 1;
    }
  });
}

type CompletionListener = (tierId: SupportTierId) => void;
const completionListeners = new Set<CompletionListener>();

/** Called when a donation that was pending is completed by the store. */
export function onPendingDonationCompleted(listener: CompletionListener): () => void {
  completionListeners.add(listener);
  return () => {
    completionListeners.delete(listener);
  };
}

let watching = false;

function handleCustomerInfoUpdate(info: CustomerInfo) {
  void processCustomerInfo(info).catch(() => undefined);
}

function watchCustomerInfo() {
  if (watching) return;
  watching = true;
  Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);
}

function stopWatchingIfIdle(records: readonly DonationFollowUp[]) {
  if (!watching || records.some((record) => record.transactionId === null)) return;
  watching = false;
  Purchases.removeCustomerInfoUpdateListener(handleCustomerInfoUpdate);
}

async function processCustomerInfo(info: CustomerInfo): Promise<void> {
  if (purchasesInFlight > 0) return;
  const completed = await updateFollowUps((records) => {
    const match = matchCompletedDonations(records, info.nonSubscriptionTransactions);
    return { records: match.records, result: match.completed };
  });
  for (const record of completed) {
    for (const listener of completionListeners) listener(record.tierId);
  }
  await sendReadyDonorNotes();
}

let sending: Promise<void> | null = null;

/** Sends every note whose donation has completed; failed sends stay queued. */
function sendReadyDonorNotes(): Promise<void> {
  sending ??= (async () => {
    try {
      const ready = (await readFollowUps()).filter(
        (record) => record.transactionId !== null && record.note !== null,
      );
      if (ready.length > 0) {
        const appUserId = await Purchases.getAppUserID();
        for (const record of ready) {
          const result = await sendDonorNote({
            appUserId,
            transactionId: record.transactionId,
            ...record.note!,
          });
          if (result === 'retry') continue;
          await updateFollowUps((records) => ({
            records: records.filter((item) => item.id !== record.id),
            result: undefined,
          }));
        }
      }
      stopWatchingIfIdle(await readFollowUps());
    } finally {
      sending = null;
    }
  })();
  return sending;
}

/**
 * Runs at launch. Only a device with an open donation (a pending payment or an
 * unsent note) configures RevenueCat here; everyone else contacts it only from
 * the Support screen, as before.
 */
export async function resumeDonationFollowUps(): Promise<void> {
  if ((await readFollowUps()).length === 0) return;
  await initializeRevenueCat();
  watchCustomerInfo();
  await processCustomerInfo(await Purchases.getCustomerInfo());
}
