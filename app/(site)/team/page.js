import { getPageWithFallback, getSettings, getTeam } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import SectionRenderer from '@/components/sections/SectionRenderer';
import { PageJsonLd } from '@/components/JsonLd';
import { personListSchema } from '@/lib/schema';

export const revalidate = 3600;

export async function generateMetadata() {
  const page = await getPageWithFallback('team');
  return buildMetadata({
    seo: page?.seo,
    path: '/team',
    fallbackTitle: 'Team',
    fallbackDescription:
      'Meet the creative minds and growth strategists driving real results for brands.',
  });
}

export default async function TeamPage() {
  const [page, settings, team] = await Promise.all([
    getPageWithFallback('team'),
    getSettings(),
    getTeam(),
  ]);

  return (
    <>
      <PageJsonLd
        path="/team"
        title={page?.seo?.title || page?.title || 'Team'}
        description={page?.seo?.description}
        type={page?.seo?.schemaType || 'AboutPage'}
        updatedAt={page?.updatedAt}
        breadcrumb={[{ name: 'Team', path: '/team' }]}
        faq={page?.seo?.faq}
        nodes={[personListSchema(team)]}
      />
      <SectionRenderer sections={page?.sections || []} settings={settings} />
    </>
  );
}
