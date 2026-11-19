import path from 'node:path';

// The dev setup must never reach production bundles (#219). Metro decides this at
// bundle time from APP_VARIANT, the same variable app.config.ts uses.
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: { sourceExts: ['js'] } }),
}));
jest.mock('uniwind/metro', () => ({
  withUniwindConfig: (config: object) => config,
}));

const projectRoot = path.resolve(__dirname, '../../..');
const realModule = path.join(projectRoot, 'src/lib/devSetup/index.ts');
const disabledModule = path.join(projectRoot, 'src/lib/devSetup/disabled.ts');
const otherModule = path.join(projectRoot, 'src/lib/settings/index.ts');

type Resolution = { type: 'sourceFile'; filePath: string };
type Resolver = (context: object, moduleName: string, platform: string) => Resolution;

const originalVariant = process.env.APP_VARIANT;
afterAll(() => {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
});

function resolveWith(variant: string | undefined, filePath: string): string {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require('../../../metro.config.js');
  const defaultResolver: Resolver = () => ({ type: 'sourceFile', filePath });
  const resolveRequest: Resolver | undefined = config.resolver.resolveRequest;
  const context = { resolveRequest: defaultResolver };
  return (resolveRequest ?? defaultResolver)(context, '~/lib/devSetup', 'ios').filePath;
}

describe.each(['production', undefined, 'staging'])('APP_VARIANT=%s', (variant) => {
  test('bundles the no-op dev setup', () => {
    expect(resolveWith(variant, realModule)).toBe(disabledModule);
    expect(resolveWith(variant, otherModule)).toBe(otherModule);
  });
});

test('beta bundles keep the dev setup', () => {
  expect(resolveWith('beta', realModule)).toBe(realModule);
});

test('the no-op module exports the same names as the real one', () => {
  const source = (file: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [
      ...require('node:fs')
        .readFileSync(file, 'utf8')
        .matchAll(/^export (?:function|const) (\w+)/gm),
    ]
      .map((match) => match[1])
      .sort();
  expect(source(disabledModule)).toEqual(source(realModule));
});
