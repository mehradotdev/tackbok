import base from '../../prettier.config.mjs';

export default {
  ...base,
  // Formatting options are inherited wholesale from the root config so the website
  // and the mobile app stay stylistically consistent. Only the Astro/Tailwind
  // tooling below is website-specific.
  plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
  tailwindStylesheet: 'src/styles/global.css',
  tailwindFunctions: ['cn', 'cva'],
  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro',
      },
    },
  ],
};
