import { getPageWithFallback, getSettings } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('contact');
  return buildMetadata({
    seo: page?.seo,
    path: '/contact',
    fallbackTitle: 'Contact',
    fallbackDescription:
      'Ready to grow your brand? Drop us a message on WhatsApp, send a quick brief, or email us directly. We respond fast, no fluff.',
  });
}

export default async function ContactPage() {
  const [page, settings] = await Promise.all([getPageWithFallback('contact'), getSettings()]);

  return (
    <>
      <PageJsonLd
        path="/contact"
        title={page?.seo?.title || page?.title || 'Contact'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'ContactPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Contact', path: '/contact' }]}
        faq={page?.seo?.faq}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
