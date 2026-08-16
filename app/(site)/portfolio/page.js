import { getPageWithFallback, getSettings, getCaseStudies } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';
import { itemListSchema } from '@/lib/schema';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('portfolio');
  return buildMetadata({
    seo: page?.seo,
    path: '/portfolio',
    fallbackTitle: 'Portfolio',
    fallbackDescription:
      "A curated showcase of campaigns, visuals, and digital experiences we've crafted for brands that mean business.",
  });
}

export default async function PortfolioPage() {
  const [page, settings, cases] = await Promise.all([
    getPageWithFallback('portfolio'),
    getSettings(),
    getCaseStudies(),
  ]);

  return (
    <>
      <PageJsonLd
        path="/portfolio"
        title={page?.seo?.title || page?.title || 'Portfolio'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'CollectionPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Portfolio', path: '/portfolio' }]}
        faq={page?.seo?.faq}
        nodes={[
          itemListSchema(
            cases.map((c) => ({ name: c.title, path: `/portfolio/${c.slug}` })),
            { name: 'Case studies' }
          ),
        ]}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
