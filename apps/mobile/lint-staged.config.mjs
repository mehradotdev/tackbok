const format = 'oxfmt --no-error-on-unmatched-pattern';

export default {
  '*.{js,jsx,ts,tsx,cjs,mjs}': ['eslint --fix --no-warn-ignored', format],
  '!(*.{js,jsx,ts,tsx,cjs,mjs})': format,
};
