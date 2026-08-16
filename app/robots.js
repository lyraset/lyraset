import { getAllPages, getServices, getCaseStudies } from '@/lib/data';
import { getSiteUrl, isIndexable } from '@/lib/site';
import { pathForPageSlug, PRIVATE_PREFIXES } from '@/lib/routes';

export const revalidate = 3600;

/**
 * robots.txt.
 *
 * Beyond the fixed admin/API blocks, the disallow list is generated: anything
 * the CMS marks "no-index" is added automatically, so hiding a page in the
 * admin both drops it from the sitemap and blocks it here — no code change.
 *
 * Preview deploys return a blanket disallow so staging never competes with
 * lyraset.com in the index.
 *
 * @returns {Promise<import('next').MetadataRoute.Robots>}
 */
export default async function robots() {
  const base = getSiteUrl();

  if (!isIndexable()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const [pages, services, cases] = await Promise.all([
    getAllPages(),
    getServices(),
    getCaseStudies(),
  ]);

  const hidden = [
    ...pages.filter((p) => p.seo?.noindex).map((p) => pathForPageSlug(p.slug)),
    ...services.filter((s) => s.seo?.noindex).map((s) => `/services/${s.slug}`),
    ...cases.filter((c) => c.seo?.noindex).map((c) => `/portfolio/${c.slug}`),
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Trailing slash on /api/ keeps the crawler off the routes without
        // blocking any future /api-* content path.
        disallow: [...PRIVATE_PREFIXES.map((p) => (p === '/api' ? '/api/' : p)), ...new Set(hidden)],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
