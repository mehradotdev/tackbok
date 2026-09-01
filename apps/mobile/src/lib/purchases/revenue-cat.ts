import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';
import {
  mapSupportCatalog,
  SUPPORT_OFFERING_ID,
  type SupportCatalogTier,
  type SupportTierId,
} from './support-catalog';

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

function getRevenueCatApiKey(): string | undefined {
  const appVariant = Constants.expoConfig?.extra?.appVariant;
  const isTestBuild = appVariant === 'beta' || __DEV__;
  if (isTestBuild) return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;

  const platform = process.env.EXPO_OS ?? Platform.OS;
  if (platform === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (platform === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  }
  return undefined;
}

export function initializeRevenueCat(): Promise<void> {
  if (configurationPromise) return configurationPromise;

  configurationPromise = (async () => {
    const platform = process.env.EXPO_OS ?? Platform.OS;
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
      Purchases.configure({ apiKey });
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

export async function purchaseSupportTier(
  tierId: SupportTierId,
): Promise<SupportPurchaseResult> {
  await initializeRevenueCat();
  const revenueCatPackage = packagesByTier.get(tierId);
  if (!revenueCatPackage) {
    throw new SupportPurchaseError(
      'configuration',
      'This support option is not currently available.',
    );
  }

  try {
    await Purchases.purchasePackage(revenueCatPackage);
    return 'completed';
  } catch (error) {
    if (isPurchasesError(error)) {
      if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return 'cancelled';
      }
      if (error.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
        return 'pending';
      }
      throw new SupportPurchaseError(
        classifyPurchasesError(error.code),
        error.message,
      );
    }
    throw new SupportPurchaseError('unknown', 'The purchase could not be completed.');
  }
}
