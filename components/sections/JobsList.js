import Link from 'next/link';
import SectionHeader from '@/components/SectionHeader';
import ApplicationForm from '@/components/forms/ApplicationForm';
import Reveal from '@/components/motion/Reveal';
import Icon from '@/components/Icon';
import '@/styles/careers.scss';

/**
 * Open roles + the general application form, used by /careers. Roles come from
 * the Careers module; every string around them is editable here.
 */
export default function JobsList({ data = {}, jobs = [] }) {
  const roles = jobs.map((j) => j.title);
  const showForm = data.showApplicationForm !== false;

  return (
    <>
      <section className="section">
        <div className="container-x">
          <SectionHeader
            eyebrow={data.eyebrow || 'Hiring Now'}
            heading={data.heading || 'Open roles'}
          />
          <div className="jobs-list">
            {jobs.map((job) => (
              <Reveal as="article" className="job-card" key={job.slug}>
                <div className="job-card__main">
                  <h3 className="job-card__title">{job.title}</h3>
                  <div className="job-card__meta">
                    <span className="chip-tag">{job.employmentType}</span>
                    <span className="job-card__loc">
                      <Icon name="map-pin" size={15} /> {job.location}
                    </span>
                  </div>
                  <p className="job-card__summary">{job.summary}</p>
                </div>
                <Link href={`/careers/${job.slug}`} className="btn btn-ghost-dark job-card__cta">
                  {data.jobCtaLabel || 'View & Apply'} <Icon name="arrow-right" size={16} />
                </Link>
              </Reveal>
            ))}
            {jobs.length === 0 && (
              <p className="lead-muted">
                {data.emptyText || 'No open roles right now — check back soon.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {showForm && (
        <section className="section section--grey" id="apply">
          <div className="container-x careers-apply">
            <div className="careers-apply__intro">
              <SectionHeader
                eyebrow={data.formEyebrow || 'Apply'}
                heading={data.formHeading || 'Send us your resume'}
                subheading={data.formSubheading}
              />
            </div>
            <div className="careers-apply__form">
              <ApplicationForm roles={roles} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
