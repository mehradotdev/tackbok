import { AppState } from 'react-native';
import { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import {
  appLockSession,
  refreshExternalAuthentication,
  useExternalAuthentication,
} from '~/lib/externalAuthentication';
import { loadSupportCatalog, purchaseSupportTier } from './revenue-cat';

const mockPurchasePackage = jest.fn();
const originalTestApiKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;

jest.mock('react-native');
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
