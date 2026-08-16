import { getPageWithFallback, getSettings, getServices } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';
import { itemListSchema } from '@/lib/schema';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('services');
  return buildMetadata({
    seo: page?.seo,
    path: '/services',
    fallbackTitle: 'Services',
    fallbackDescription:
      '360° digital marketing — paid ads, social, SEO, video, brand, data, lifecycle, and growth strategy.',
  });
}

export default async function ServicesPage() {
  const [page, settings, services] = await Promise.all([
    getPageWithFallback('services'),
    getSettings(),
    getServices(),
  ]);

  return (
    <>
      <PageJsonLd
        path="/services"
        title={page?.seo?.title || page?.title || 'Services'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'CollectionPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Services', path: '/services' }]}
        faq={page?.seo?.faq}
        nodes={[
          itemListSchema(
            services.map((s) => ({ name: s.title, path: `/services/${s.slug}` })),
            { name: 'Services' }
          ),
        ]}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
