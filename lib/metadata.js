import { getSeoDefault } from '@/lib/data';
import { getSiteUrl, isIndexable } from '@/lib/site';

/**
 * Build a Next.js Metadata object by merging per-entity SEO overrides with the
 * CMS SEO defaults. Used by every public page's generateMetadata.
 *
 * Everything here is CMS-controlled: the defaults come from SEO Settings, and
 * any page or collection item can override them from its own SEO panel.
 *
 * @param {object} opts
 * @param {object} [opts.seo] - per-entity seo override block
 * @param {string} [opts.path] - path for the canonical URL (e.g. "/services/seo")
 * @param {string} [opts.fallbackTitle]
 * @param {string} [opts.fallbackDescription]
 * @returns {Promise<import('next').Metadata>}
 */
export async function buildMetadata({
  seo = {},
  path = '/',
  fallbackTitle,
  fallbackDescription,
} = {}) {
  const def = await getSeoDefault();
  const siteUrl = getSiteUrl();

  const title = seo.title || fallbackTitle || def.defaultTitle;
  const description = seo.description || fallbackDescription || def.defaultDescription;
  const ogImage = seo.ogImage?.url || def.defaultOgImage?.url;
  const canonical = seo.canonical || `${siteUrl}${path === '/' ? '' : path}`;
  const keywords = seo.keywords?.length ? seo.keywords : def.defaultKeywords;

  // A page is noindex if the CMS says so, or if this whole deployment is a
  // preview build that must not compete with the production domain.
  const noindex = Boolean(seo.noindex) || !isIndexable();

  return {
    title: { absolute: title },
    description,
    keywords: keywords?.length ? keywords : undefined,
    alternates: { canonical },
    robots: noindex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: def.organization?.name || 'LYRASET',
      locale: 'en_US',
      type: 'website',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: def.twitterHandle || undefined,
      creator: def.twitterHandle || undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
