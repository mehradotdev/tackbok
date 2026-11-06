const format = 'oxfmt --no-error-on-unmatched-pattern';

export default {
  '*.{js,jsx,ts,tsx,cjs,mjs,astro}': ['eslint --fix --no-warn-ignored', format],
  '!(*.{js,jsx,ts,tsx,cjs,mjs,astro})': format,
};
