// Output names and pixel dimensions. Both stores share the same raw inputs.
// Tablet sets are portrait because Xcode 27 simulators can't be rotated from a
// script; the renderer still has a landscape layout for wider presets.
export const presets = {
  iphone: { width: 1242, height: 2688, input: 'phone' },
  'android-phone': { width: 1080, height: 1920, input: 'phone' },
  ipad: { width: 2064, height: 2752, input: 'tablet' },
  'android-tablet': { width: 1600, height: 2560, input: 'tablet' },
};
