import { getServices, getCaseStudies, getJobs, getAllPages } from '@/lib/data';
import { getSiteUrl } from '@/lib/site';
import {
  getCodeRoutes,
  pathForPageSlug,
  hintsFor,
  COLLECTION_HINTS,
  PRIVATE_PREFIXES,
} from '@/lib/routes';

// Regenerate hourly, and immediately on any CMS write (the admin revalidates
// the 'pages' / 'services' / 'case-studies' / 'jobs' tags this reads through).
export const revalidate = 3600;

/**
 * sitemap.xml, assembled from every source of public URLs.
 *
 * Nothing here is a hard-coded URL list: CMS pages, collection items, and
 * file-based routes are each enumerated at build time, deduped by path, and
 * filtered against noindex. Publishing a page in the admin is enough to get it
 * indexed — no code change, no redeploy beyond the automatic revalidation.
 *
 * @returns {Promise<import('next').MetadataRoute.Sitemap>}
 */
export default async function sitemap() {
  const base = getSiteUrl();
  const [pages, services, cases, jobs] = await Promise.all([
    getAllPages(),
    getServices(),
    getCaseStudies(),
    getJobs(),
  ]);

  const now = new Date();
  /** @type {Map<string, {url: string, lastModified: Date, changeFrequency: string, priority: number}>} */
  const entries = new Map();

  const add = (routePath, { lastModified, seo = {}, hints = {} } = {}) => {
    if (!routePath) return;
    if (PRIVATE_PREFIXES.some((p) => routePath === p || routePath.startsWith(`${p}/`))) return;
    // Respect the CMS "no-index" switch and the explicit sitemap opt-out.
    if (seo.noindex || seo.sitemapExclude) return;

    const { priority, changeFrequency } = hintsFor(routePath, { ...hints, ...seo });
    entries.set(routePath, {
      url: routePath === '/' ? base : `${base}${routePath}`,
      lastModified: lastModified ? new Date(lastModified) : now,
      changeFrequency,
      priority,
    });
  };

  // 1. File-based routes — the floor, so a hand-built page is never missing.
  for (const routePath of getCodeRoutes()) add(routePath);

  // 2. CMS pages — override the entry above with real lastModified + SEO flags.
  for (const page of pages) {
    add(pathForPageSlug(page.slug), { lastModified: page.updatedAt, seo: page.seo || {} });
  }

  // 3. Collection detail pages.
  const collections = [
    ['/services', services],
    ['/portfolio', cases],
    ['/careers', jobs],
  ];
  for (const [prefix, items] of collections) {
    for (const item of items) {
      if (!item.slug) continue;
      add(`${prefix}/${item.slug}`, {
        lastModified: item.updatedAt,
        seo: item.seo || {},
        hints: COLLECTION_HINTS[prefix],
      });
    }
  }

  return [...entries.values()].sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url));
}
