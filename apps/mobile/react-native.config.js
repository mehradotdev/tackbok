const { androidStore } = require('./config/android-store');

module.exports = {
  dependencies: {
    'react-native-purchases-store-galaxy': {
      platforms: {
        ios: null,
        ...(androidStore === 'samsung' ? {} : { android: null }),
      },
    },
  },
};
