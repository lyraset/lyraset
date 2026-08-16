import { getPageWithFallback, getSettings } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('privacy');
  return buildMetadata({ seo: page?.seo, path: '/privacy', fallbackTitle: 'Privacy Policy' });
}

export default async function PrivacyPage() {
  const [page, settings] = await Promise.all([getPageWithFallback('privacy'), getSettings()]);

  return (
    <>
      <PageJsonLd
        path="/privacy"
        title={page?.seo?.title || page?.title || 'Privacy Policy'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'WebPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Privacy Policy', path: '/privacy' }]}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
