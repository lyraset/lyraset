import { notFound } from 'next/navigation';
import { getPage, getAllPages, getSettings } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';
import { getCodeRoutes } from '@/lib/routes';

export const revalidate = 3600;

/**
 * Catch-all renderer for CMS-authored pages.
 *
 * Every page created in the admin lands here: publish "pricing" and /pricing
 * renders, gets metadata and JSON-LD, and appears in the sitemap — no code
 * change and no redeploy. Next.js matches static segments before dynamic ones,
 * so /about, /services etc. still resolve to their own route files; this only
 * catches slugs those don't claim.
 */

/** Slugs already owned by a route file — excluded so nothing renders twice. */
function reservedSlugs() {
  return new Set(
    getCodeRoutes()
      .filter((r) => r !== '/' && !r.slice(1).includes('/'))
      .map((r) => r.slice(1))
  );
}

export async function generateStaticParams() {
  const [pages, reserved] = [await getAllPages(), reservedSlugs()];
  return pages
    .filter((p) => p.slug && p.slug !== 'home' && !reserved.has(p.slug))
    .map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return buildMetadata({
    seo: page.seo,
    path: `/${slug}`,
    fallbackTitle: page.title,
  });
}

export default async function CmsPage({ params }) {
  const { slug } = await params;
  if (reservedSlugs().has(slug) || slug === 'home') return notFound();

  const [page, settings] = await Promise.all([getPage(slug), getSettings()]);
  if (!page) return notFound();

  return (
    <>
      <PageJsonLd
        path={`/${slug}`}
        title={page.seo?.title || page.title}
        description={page.seo?.description}
        type={page.seo?.schemaType || 'WebPage'}
        updatedAt={page.updatedAt}
        breadcrumb={[{ name: page.title || slug, path: `/${slug}` }]}
        faq={page.seo?.faq}
      />
      <SectionRenderer sections={page.sections || []} settings={settings} />
    </>
  );
}
