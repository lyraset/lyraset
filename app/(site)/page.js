import { getPageWithFallback, getSettings } from '@/lib/data';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { buildMetadata } from '@/lib/metadata';
import { PageJsonLd } from '@/components/JsonLd';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('home');
  return buildMetadata({ seo: page?.seo, path: '/' });
}

export default async function HomePage() {
  const [page, settings] = await Promise.all([getPageWithFallback('home'), getSettings()]);

  return (
    <>
      {/* Organization + WebSite nodes come from the site layout; this adds the
          WebPage node for "/". */}
      <PageJsonLd
        path="/"
        title={page?.seo?.title || page?.title}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'WebPage'}
        updatedAt={page?.updatedAt}
        faq={page?.seo?.faq}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
