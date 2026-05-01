export const Platform = {
  OS: 'ios',
  select<T>(options: { ios?: T; android?: T; default?: T }) {
    return options[this.OS as 'ios' | 'android'] ?? options.default;
  },
};

export const __mockReactNativeState = {
  Platform,
};
