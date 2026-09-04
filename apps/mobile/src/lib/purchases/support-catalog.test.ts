import {
  mapSupportCatalog,
  SUPPORT_TIER_DEFINITIONS,
} from './support-catalog';

const allPackages = SUPPORT_TIER_DEFINITIONS.map((tier, index) => ({
  packageId: tier.packageId,
  productId: tier.productId,
  priceString: `$${index + 1}.99`,
}));

describe('support catalog', () => {
  test('keeps the intentional tier order and uses live localized prices', () => {
    const catalog = mapSupportCatalog(allPackages);

    expect(catalog.map((tier) => tier.id)).toEqual([
      'small',
      'heartfelt',
      'big',
      'deepest',
    ]);
    expect(catalog.map((tier) => tier.priceString)).toEqual([
      '$1.99',
      '$2.99',
      '$3.99',
      '$4.99',
    ]);
    expect(catalog.every((tier) => tier.available)).toBe(true);
  });

  test('keeps missing packages visible but unavailable', () => {
    const catalog = mapSupportCatalog(allPackages.slice(0, 2));

    expect(catalog).toHaveLength(4);
    expect(catalog[2]).toMatchObject({ id: 'big', available: false, priceString: null });
    expect(catalog[3]).toMatchObject({
      id: 'deepest',
      available: false,
      priceString: null,
    });
  });

  test('rejects a package wired to the wrong store product', () => {
    const catalog = mapSupportCatalog([
      { ...allPackages[0], productId: 'wrong.product' },
    ]);

    expect(catalog[0]).toMatchObject({
      id: 'small',
      available: false,
      priceString: null,
    });
  });
});
