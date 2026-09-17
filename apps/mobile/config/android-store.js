// Shared by Expo config and native autolinking. Keep the store selection identical.
const androidStore = process.env.ANDROID_STORE || 'google';
if (!['google', 'samsung'].includes(androidStore)) {
  throw new Error('ANDROID_STORE must be google or samsung.');
}
const galaxyBillingMode = process.env.GALAXY_BILLING_MODE || 'PRODUCTION';
if (!['PRODUCTION', 'TEST'].includes(galaxyBillingMode)) {
  throw new Error('GALAXY_BILLING_MODE must be PRODUCTION or TEST.');
}
module.exports = { androidStore, galaxyBillingMode };
