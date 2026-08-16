import { getPageWithFallback, getSettings } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('about');
  return buildMetadata({ seo: page?.seo, path: '/about', fallbackTitle: 'About' });
}

export default async function AboutPage() {
  const [page, settings] = await Promise.all([getPageWithFallback('about'), getSettings()]);

  return (
    <>
      <PageJsonLd
        path="/about"
        title={page?.seo?.title || page?.title || 'About'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'AboutPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'About', path: '/about' }]}
        faq={page?.seo?.faq}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
