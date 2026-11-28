/** Release notes live in GitHub Releases; the changelog page is built from them. */
export const RELEASES_PAGE = 'https://github.com/mehradotdev/tackbok/releases';
// shortcut: one page of up to 100 releases, add paging past that.
const RELEASES_API =
  'https://api.github.com/repos/mehradotdev/tackbok/releases?per_page=100';

export interface Release {
  /** For example `1.0.3`, from the `v1.0.3` tag. */
  version: string;
  publishedAt: Date;
  /** The notes as HTML, rendered and sanitized by GitHub. */
  html: string;
  url: string;
}

interface ApiRelease {
  tag_name?: unknown;
  published_at?: unknown;
  body_html?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

/**
 * Published releases, newest first, read once at build time. Null when GitHub
 * can't be reached or answers unexpectedly: the page then links to GitHub
 * instead, so a deploy never fails over release notes.
 */
export async function loadReleases(): Promise<Release[] | null> {
  try {
    const response = await fetch(RELEASES_API, {
      // `body_html` saves rendering Markdown here.
      headers: { Accept: 'application/vnd.github.html+json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) throw new Error('GitHub sent no release list');
    return (data as ApiRelease[]).flatMap((release) => {
      const { tag_name, published_at, body_html, html_url } = release;
      if (release.draft || release.prerelease) return [];
      if (typeof tag_name !== 'string' || typeof published_at !== 'string') return [];
      const version = tag_name.replace(/^v/, '');
      const publishedAt = new Date(published_at);
      // The page formats the date, which throws on an invalid one.
      if (!version || Number.isNaN(publishedAt.getTime())) return [];
      return [
        {
          version,
          publishedAt,
          html: typeof body_html === 'string' ? nestHeadings(body_html) : '',
          url: typeof html_url === 'string' ? html_url : RELEASES_PAGE,
        },
      ];
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[changelog] Release notes not loaded (${reason}); linking to GitHub.`);
    return null;
  }
}

/** The notes sit under each release's own heading, so their headings go one level down. */
export function nestHeadings(html: string): string {
  return html.replace(
    /<(\/?)h([1-5])(?=[\s>])/gi,
    (_, slash: string, level: string) => `<${slash}h${Number(level) + 1}`,
  );
}
