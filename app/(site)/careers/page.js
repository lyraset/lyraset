import { getPageWithFallback, getSettings, getJobs } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';
import { itemListSchema } from '@/lib/schema';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('careers');
  return buildMetadata({
    seo: page?.seo,
    path: '/careers',
    fallbackTitle: 'Careers',
    fallbackDescription:
      "We're always looking for talented people passionate about digital marketing, creativity, and delivering real results.",
  });
}

export default async function CareersPage() {
  const [page, settings, jobs] = await Promise.all([
    getPageWithFallback('careers'),
    getSettings(),
    getJobs(),
  ]);

  return (
    <>
      <PageJsonLd
        path="/careers"
        title={page?.seo?.title || page?.title || 'Careers'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'CollectionPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Careers', path: '/careers' }]}
        faq={page?.seo?.faq}
        nodes={[
          itemListSchema(
            jobs.map((j) => ({ name: j.title, path: `/careers/${j.slug}` })),
            { name: 'Open roles' }
          ),
        ]}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
