import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServices, getServiceBySlug } from '@/lib/data';
import { buildMetadata } from '@/lib/metadata';
import MediaImage from '@/components/MediaImage';
import ServiceVisual from '@/components/sections/ServiceVisual';
import LeadForm from '@/components/forms/LeadForm';
import SectionHeader from '@/components/SectionHeader';
import Reveal from '@/components/motion/Reveal';
import Icon from '@/components/Icon';
import { ServiceJsonLd, BreadcrumbJsonLd } from '@/components/JsonLd';
import { getSiteUrl } from '@/lib/site';
import '@/styles/service-detail.scss';

export const revalidate = 3600;

export async function generateStaticParams() {
  const services = await getServices();
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return {};
  return buildMetadata({
    seo: service.seo,
    path: `/services/${slug}`,
    fallbackTitle: service.title,
    fallbackDescription: service.shortBlurb,
  });
}

export default async function ServiceDetailPage({ params }) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return notFound();

  const siteUrl = getSiteUrl();

  return (
    <>
      <ServiceJsonLd service={service} />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: siteUrl },
          { name: 'Services', url: `${siteUrl}/services` },
          { name: service.title, url: `${siteUrl}/services/${slug}` },
        ]}
      />

      {/* Hero */}
      <section className="service-hero section--dark">
        <span className="glow-blob service-hero__glow" aria-hidden="true" />
        <div className="container-x service-hero__inner">
          <div className="service-hero__content">
            <Reveal as="span" className="eyebrow service-hero__eyebrow">
              <span className="icon-chip service-hero__chip">
                <Icon name={service.iconKey || 'sparkles'} size={20} />
              </span>
              {service.title}
            </Reveal>
            <Reveal as="h1" className="display-xl service-hero__title" delay={0.05}>
              {service.heroHeadline || service.title}
            </Reveal>
            <Reveal as="p" className="service-hero__desc" delay={0.1}>
              {service.description}
            </Reveal>
            <Reveal className="service-hero__ctas" delay={0.15}>
              <Link href="#lead" className="btn btn-primary btn-lg">
                {service.formTitle || 'Get Started'}
                <span className="btn-arrow"><Icon name="arrow-right" size={18} /></span>
              </Link>
              <Link href="/portfolio" className="btn btn-ghost btn-lg">
                Our Case Studies
              </Link>
            </Reveal>
          </div>
          <Reveal className="service-hero__visual" delay={0.1}>
            {service.heroImage?.url ? (
              <MediaImage
                media={service.heroImage}
                label={service.title}
                ratio="4/3"
                sizes="(max-width: 992px) 90vw, 45vw"
                priority
              />
            ) : (
              <ServiceVisual slug={service.slug} iconKey={service.iconKey} />
            )}
          </Reveal>
        </div>
      </section>

      {/* Deliverables + lead form */}
      <section className="section service-body" id="lead">
        <div className="container-x service-body__grid">
          <div className="service-deliverables">
            <SectionHeader eyebrow="What's included" heading="Deliverables" />
            <ul className="deliverables-list">
              {(service.deliverables || []).map((d, i) => (
                <Reveal as="li" key={i} delay={i * 0.05} className="deliverable">
                  <span className="deliverable__check">
                    <Icon name="check" size={18} />
                  </span>
                  {d}
                </Reveal>
              ))}
            </ul>

            {(service.extraBlocks || []).length > 0 && (
              <div className="service-extra">
                {service.extraBlocks.map((b, i) => (
                  <div className="service-extra__block" key={i}>
                    {b.heading && <h3>{b.heading}</h3>}
                    {b.body && <p>{b.body}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {service.formEnabled !== false && (
            <div className="service-form-card">
              <LeadForm
                source={`service:${service.slug}`}
                serviceSlug={service.slug}
                formTitle={service.formTitle || 'Get a Free Consultation'}
                buttonLabel="Send Request"
                splitName
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
