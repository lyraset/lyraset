import { getPageWithFallback, getSettings } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('terms');
  return buildMetadata({ seo: page?.seo, path: '/terms', fallbackTitle: 'Terms of Service' });
}

export default async function TermsPage() {
  const [page, settings] = await Promise.all([getPageWithFallback('terms'), getSettings()]);

  return (
    <>
      <PageJsonLd
        path="/terms"
        title={page?.seo?.title || page?.title || 'Terms of Service'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'WebPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Terms of Service', path: '/terms' }]}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
