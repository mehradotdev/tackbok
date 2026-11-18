/**
 * With `build.format: 'file'`, `Astro.url.pathname` ends in `.html` at build
 * time (`/faq.html`, `/index.html`). Returns the public URL path (`/faq`, `/`).
 */
export function pagePath(pathname: string): string {
  return pathname.replace(/(?:\/index)?\.html$/, '') || '/';
}
