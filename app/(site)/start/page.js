import { getPageWithFallback, getSettings } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('start');
  return buildMetadata({ seo: page?.seo, path: '/start', fallbackTitle: "Glad You're Here" });
}

export default async function StartPage() {
  const [page, settings] = await Promise.all([getPageWithFallback('start'), getSettings()]);

  return (
    <>
      <PageJsonLd
        path="/start"
        title={page?.seo?.title || page?.title}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'WebPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Start', path: '/start' }]}
        faq={page?.seo?.faq}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
