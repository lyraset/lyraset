import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobs, getJobBySlug } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import ApplicationForm from '@/components/forms/ApplicationForm';
import Reveal from '@/components/motion/Reveal';
import Icon from '@/components/Icon';
import { PageJsonLd } from '@/components/JsonLd';
import { jobPostingSchema } from '@/lib/schema';
import { getSettings } from '@/lib/data';
import '@/styles/careers.scss';

export const revalidate = 3600;

export async function generateStaticParams() {
  const jobs = await getJobs();
  return jobs.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) return {};
  return buildMetadata({
    seo: job.seo,
    path: `/careers/${slug}`,
    fallbackTitle: job.title,
    fallbackDescription: job.summary,
  });
}

export default async function JobDetailPage({ params }) {
  const { slug } = await params;
  const [job, settings] = await Promise.all([getJobBySlug(slug), getSettings()]);
  if (!job) return notFound();

  return (
    <>
      <PageJsonLd
        path={`/careers/${slug}`}
        title={job.seo?.title || job.title}
        description={job.seo?.description || job.summary}
        updatedAt={job.updatedAt}
        breadcrumb={[
          { name: 'Careers', path: '/careers' },
          { name: job.title, path: `/careers/${slug}` },
        ]}
        faq={job.seo?.faq}
        nodes={[jobPostingSchema(job, { settings })]}
      />

      <section className="section job-detail__hero">
        <div className="container-x">
          <Link href="/careers" className="chip-tag" style={{ marginBottom: '1rem', display: 'inline-block' }}>
            ← All roles
          </Link>
          <Reveal as="h1" className="display-xl">
            {job.title}
          </Reveal>
          <div className="job-detail__meta">
            <span className="chip-tag">{job.employmentType}</span>
            <span className="job-card__loc">
              <Icon name="map-pin" size={16} /> {job.location}
            </span>
            {job.open ? (
              <span className="job-detail__open">Open</span>
            ) : (
              <span className="job-detail__closed">Closed</span>
            )}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container-x job-detail__body">
          <div className="job-detail__content">
            {job.summary && <p className="job-detail__summary">{job.summary}</p>}

            {job.responsibilities?.length > 0 && (
              <div className="job-detail__block">
                <h2>What You&apos;ll Do</h2>
                <ul className="job-detail__list">
                  {job.responsibilities.map((r, i) => (
                    <li key={i}>
                      <Icon name="arrow-right" size={16} /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.requirements?.length > 0 && (
              <div className="job-detail__block">
                <h2>What We&apos;re Looking For</h2>
                <ul className="job-detail__list">
                  {job.requirements.map((r, i) => (
                    <li key={i}>
                      <Icon name="check" size={16} /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="job-detail__apply" id="apply">
            <div className="job-detail__apply-card">
              <h3>Apply for this role</h3>
              <ApplicationForm roles={[job.title]} defaultRole={job.title} jobSlug={job.slug} />
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
