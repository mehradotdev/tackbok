const format = 'prettier --write --ignore-unknown --ignore-path ../../.prettierignore';

export default {
  '*.{js,jsx,ts,tsx,cjs,mjs,astro}': ['eslint --fix --no-warn-ignored', format],
  '!(*.{js,jsx,ts,tsx,cjs,mjs,astro})': format,
};
