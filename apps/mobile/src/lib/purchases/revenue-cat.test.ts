import { AppState } from 'react-native';
import { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import {
  appLockSession,
  refreshExternalAuthentication,
  useExternalAuthentication,
} from '~/lib/externalAuthentication';
import {
  loadSupportCatalog,
  onPendingDonationCompleted,
  purchaseSupportTier,
} from './revenue-cat';
import { DONATION_FOLLOW_UPS_KEY, readFollowUps } from './donation-follow-ups';

const mockPurchasePackage = jest.fn();
const mockSaved = new Map<string, string>();
const mockTransactions: {
  transactionIdentifier: string;
  productIdentifier: string;
  purchaseDate: string;
}[] = [];
const mockCustomerInfoListeners = new Set<(info: unknown) => void>();
const mockFetch = jest.fn();
const originalTestApiKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;

jest.mock('react-native');
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => mockSaved.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockSaved.set(key, value),
    removeItem: async (key: string) => void mockSaved.delete(key),
  },
}));
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { appVariant: 'beta' } },
}));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(async () => true),
    getOfferings: jest.fn(async () => {
      const offering = {
        identifier: 'support',
        availablePackages: [
          {
            identifier: 'thanks_small',
            product: {
              identifier: 'dev.mehra.tackbok.support.small.v2',
              priceString: '$3.00',
            },
          },
        ],
      };
      return { current: offering, all: { support: offering } };
    }),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    getCustomerInfo: jest.fn(async () => ({
      nonSubscriptionTransactions: [...mockTransactions],
    })),
    getAppUserID: jest.fn(async () => '$RCAnonymousID:test'),
    addCustomerInfoUpdateListener: (listener: (info: unknown) => void) =>
      void mockCustomerInfoListeners.add(listener),
    removeCustomerInfoUpdateListener: (listener: (info: unknown) => void) =>
      mockCustomerInfoListeners.delete(listener),
    LOG_LEVEL: { DEBUG: 'DEBUG' },
  },
  PURCHASES_ERROR_CODE: {
    NETWORK_ERROR: 'NETWORK_ERROR',
    OFFLINE_CONNECTION_ERROR: 'OFFLINE_CONNECTION_ERROR',
    PRODUCT_REQUEST_TIMED_OUT_ERROR: 'PRODUCT_REQUEST_TIMED_OUT_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    INVALID_CREDENTIALS_ERROR: 'INVALID_CREDENTIALS_ERROR',
    UNSUPPORTED_ERROR: 'UNSUPPORTED_ERROR',
    PURCHASE_NOT_ALLOWED_ERROR: 'PURCHASE_NOT_ALLOWED_ERROR',
    INSUFFICIENT_PERMISSIONS_ERROR: 'INSUFFICIENT_PERMISSIONS_ERROR',
    STORE_PROBLEM_ERROR: 'STORE_PROBLEM_ERROR',
    PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR',
    PURCHASE_INVALID_ERROR: 'PURCHASE_INVALID_ERROR',
    PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR',
    PAYMENT_PENDING_ERROR: 'PAYMENT_PENDING_ERROR',
  },
}));

beforeAll(() => {
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = 'test-api-key';
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  if (originalTestApiKey === undefined) {
    delete process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  } else {
    process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = originalTestApiKey;
  }
});

beforeEach(async () => {
  mockPurchasePackage.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 202 });
  mockSaved.clear();
  mockTransactions.length = 0;
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  appLockSession.transition('active', 0);
  refreshExternalAuthentication();
  await loadSupportCatalog();
});

test('keeps the app-lock exemption through a successful store return', async () => {
  let exemptionActiveDuringPurchase = false;
  let lockedWhileBackgrounding = true;
  mockPurchasePackage.mockImplementationOnce(async () => {
    exemptionActiveDuringPurchase = useExternalAuthentication.getState().active;
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'background',
    });
    lockedWhileBackgrounding = appLockSession.transition('background', 0);
  });

  await expect(purchaseSupportTier('small')).resolves.toBe('completed');
  expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
  expect(exemptionActiveDuringPurchase).toBe(true);
  expect(lockedWhileBackgrounding).toBe(false);
  expect(useExternalAuthentication.getState().active).toBe(true);

  expect(appLockSession.transition('active', 0)).toBe(false);
  refreshExternalAuthentication();
  expect(useExternalAuthentication.getState().active).toBe(false);
});

test('releases the app-lock exemption immediately after foreground cancellation', async () => {
  mockPurchasePackage.mockRejectedValueOnce({
    code: PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR,
    message: 'cancelled',
  });

  await expect(purchaseSupportTier('small')).resolves.toBe('cancelled');
  expect(useExternalAuthentication.getState().active).toBe(false);
  expect(appLockSession.transition('background', 0)).toBe(true);
});

const PRODUCT_ID = 'dev.mehra.tackbok.support.small.v2';
const note = { message: 'Thank you!', email: 'donor@example.com' };

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('sends the note after a completed purchase and clears the record', async () => {
  mockPurchasePackage.mockResolvedValueOnce({
    transaction: { transactionIdentifier: 'tx-now' },
  });

  await expect(purchaseSupportTier('small', note)).resolves.toBe('completed');
  await flush();

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
    appUserId: '$RCAnonymousID:test',
    transactionId: 'tx-now',
    ...note,
  });
  expect(mockSaved.has(DONATION_FOLLOW_UPS_KEY)).toBe(false);
});

test('stores nothing for an anonymous completed purchase', async () => {
  mockPurchasePackage.mockResolvedValueOnce({
    transaction: { transactionIdentifier: 'tx-anon' },
  });

  await expect(purchaseSupportTier('small')).resolves.toBe('completed');
  await flush();

  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockSaved.has(DONATION_FOLLOW_UPS_KEY)).toBe(false);
});

test('keeps a failed send queued for a later retry', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
  mockPurchasePackage.mockResolvedValueOnce({
    transaction: { transactionIdentifier: 'tx-retry' },
  });

  await purchaseSupportTier('small', note);
  await flush();

  expect(await readFollowUps()).toEqual([
    expect.objectContaining({ transactionId: 'tx-retry', note }),
  ]);
});

test('completes a pending donation later and only then sends its note', async () => {
  mockTransactions.push({
    transactionIdentifier: 'tx-older',
    productIdentifier: PRODUCT_ID,
    purchaseDate: new Date().toISOString(),
  });
  mockPurchasePackage.mockRejectedValueOnce({
    code: PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR,
    message: 'pending',
  });
  const completed = jest.fn();
  const unsubscribe = onPendingDonationCompleted(completed);

  await expect(purchaseSupportTier('small', note)).resolves.toBe('pending');
  await flush();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(await readFollowUps()).toEqual([
    expect.objectContaining({ transactionId: null, knownTransactionIds: ['tx-older'] }),
  ]);
  expect(mockCustomerInfoListeners.size).toBe(1);

  // An update that only lists the older donation completes nothing.
  for (const listener of mockCustomerInfoListeners) {
    listener({ nonSubscriptionTransactions: [...mockTransactions] });
  }
  await flush();
  expect(completed).not.toHaveBeenCalled();

  mockTransactions.push({
    transactionIdentifier: 'tx-later',
    productIdentifier: PRODUCT_ID,
    purchaseDate: new Date().toISOString(),
  });
  for (const listener of mockCustomerInfoListeners) {
    listener({ nonSubscriptionTransactions: [...mockTransactions] });
  }
  await flush();

  expect(completed).toHaveBeenCalledWith('small');
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockFetch.mock.calls[0][1].body).transactionId).toBe('tx-later');
  expect(mockSaved.has(DONATION_FOLLOW_UPS_KEY)).toBe(false);
  expect(mockCustomerInfoListeners.size).toBe(0);
  unsubscribe();
});
