import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCaseStudies, getCaseStudyBySlug } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import MediaImage from '@/components/MediaImage';
import Reveal from '@/components/motion/Reveal';
import Icon from '@/components/Icon';
import { PageJsonLd } from '@/components/JsonLd';
import { caseStudySchema } from '@/lib/schema';
import '@/styles/portfolio.scss';

export const revalidate = 3600;

export async function generateStaticParams() {
  const items = await getCaseStudies();
  return items.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const item = await getCaseStudyBySlug(slug);
  if (!item) return {};
  return buildMetadata({
    seo: item.seo,
    path: `/portfolio/${slug}`,
    fallbackTitle: item.title,
    fallbackDescription: item.summary,
  });
}

export default async function CaseStudyPage({ params }) {
  const { slug } = await params;
  const item = await getCaseStudyBySlug(slug);
  if (!item) return notFound();

  const blocks = [
    ['The Challenge', item.challenge],
    ['Our Approach', item.approach],
    ['The Results', item.results],
  ].filter(([, v]) => v);

  return (
    <>
      <PageJsonLd
        path={`/portfolio/${slug}`}
        title={item.seo?.title || item.title}
        description={item.seo?.description || item.summary}
        image={item.coverImage?.url}
        updatedAt={item.updatedAt}
        breadcrumb={[
          { name: 'Portfolio', path: '/portfolio' },
          { name: item.title, path: `/portfolio/${slug}` },
        ]}
        faq={item.seo?.faq}
        nodes={[caseStudySchema(item)]}
      />

      <section className="section case-detail__hero">
        <div className="container-x">
          <Link href="/portfolio" className="chip-tag" style={{ marginBottom: '1rem', display: 'inline-block' }}>
            ← Back to work
          </Link>
          <div className="case-detail__meta">
            {item.categoryName && <span className="chip-tag">{item.categoryName}</span>}
            {item.client && <span className="lead-muted">Client · {item.client}</span>}
          </div>
          <Reveal as="h1" className="display-xl">
            {item.title}
          </Reveal>
          {item.summary && (
            <Reveal as="p" className="lead-muted" delay={0.05} style={{ maxWidth: '60ch', marginTop: '1rem' }}>
              {item.summary}
            </Reveal>
          )}
          <div className="case-detail__cover">
            <MediaImage
              media={item.coverImage}
              label={item.client || item.title}
              ratio="16/9"
              sizes="100vw"
              priority
            />
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container-x case-detail__body">
          <div>
            {blocks.map(([title, body]) => (
              <Reveal className="case-block" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}

            {item.gallery?.length > 0 && (
              <div className="case-gallery">
                {item.gallery.map((g, i) => (
                  <MediaImage key={i} media={g} label={item.title} ratio="4/3" sizes="50vw" />
                ))}
              </div>
            )}
          </div>

          {item.metrics?.length > 0 && (
            <aside className="case-metrics">
              <h4>Impact</h4>
              {item.metrics.map((m, i) => (
                <div className="case-metric" key={i}>
                  <div className="case-metric__value">{m.value}</div>
                  <div className="case-metric__label">{m.label}</div>
                </div>
              ))}
            </aside>
          )}
        </div>
      </section>

      <section className="section section--dark">
        <div className="container-x text-center">
          <h2 className="display-lg">Want results like these?</h2>
          <p className="lead-muted" style={{ maxWidth: '46ch', margin: '1rem auto 2rem' }}>
            Tell us about your brand and goals — we&apos;ll show you what winning could look like.
          </p>
          <Link href="/contact" className="btn btn-primary btn-lg">
            Start Your Growth <span className="btn-arrow"><Icon name="arrow-right" size={18} /></span>
          </Link>
        </div>
      </section>
    </>
  );
}
