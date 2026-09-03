export const SUPPORT_OFFERING_ID = 'support';

export const SUPPORT_TIER_DEFINITIONS = [
  {
    id: 'small',
    packageId: 'thanks_small',
    productId: 'dev.mehra.tackbok.support.small.v2',
    titleKey: 'Small thanks',
    descriptionKey: 'Helps me finish work 10 minutes earlier',
  },
  {
    id: 'heartfelt',
    packageId: 'thanks_heartfelt',
    productId: 'dev.mehra.tackbok.support.heartfelt.v2',
    titleKey: 'Heartfelt thanks',
    descriptionKey: 'Helps pay for hosting and online services',
  },
  {
    id: 'big',
    packageId: 'thanks_big',
    productId: 'dev.mehra.tackbok.support.big.v2',
    titleKey: 'Big thanks',
    descriptionKey: 'Helps test and release Tackbok updates',
  },
  {
    id: 'deepest',
    packageId: 'thanks_deepest',
    productId: 'dev.mehra.tackbok.support.deepest',
    titleKey: 'Deepest thanks',
    descriptionKey: 'Helps cover one month of Tackbok’s running costs and ongoing development',
  },
] as const;

export type SupportTierId = (typeof SUPPORT_TIER_DEFINITIONS)[number]['id'];

export type SupportPackageSnapshot = {
  packageId: string;
  productId: string;
  priceString: string;
};

export type SupportCatalogTier = (typeof SUPPORT_TIER_DEFINITIONS)[number] & {
  available: boolean;
  priceString: string | null;
};

/**
 * Projects RevenueCat's live packages onto the fixed UI catalog. Every tier is
 * returned even when the store omits or misconfigures a product, preventing a
 * partial response from silently changing the support screen's structure.
 */
export function mapSupportCatalog(
  packages: readonly SupportPackageSnapshot[],
): SupportCatalogTier[] {
  const packagesById = new Map(packages.map((item) => [item.packageId, item]));

  return SUPPORT_TIER_DEFINITIONS.map((definition) => {
    const item = packagesById.get(definition.packageId);
    const available = item?.productId === definition.productId;
    return {
      ...definition,
      available,
      priceString: available ? item.priceString : null,
    };
  });
}
