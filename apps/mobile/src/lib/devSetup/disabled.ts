// Production stand-in for `./index`: Metro resolves `~/lib/devSetup` here unless
// APP_VARIANT is `beta` (see metro.config.js), so release bundles carry no dev setup.
import type * as DevSetupModule from './index';

export const useDevSetup: typeof DevSetupModule.useDevSetup = () => true;

export const DevSetupNavigation: typeof DevSetupModule.DevSetupNavigation = () => null;
