import ServiceCard from '@/components/cards/ServiceCard';
import Reveal from '@/components/motion/Reveal';
import '@/styles/services.scss';

/**
 * The full services grid used by /services. Distinct from `servicesGrid`, which
 * is the home-page teaser with its own heading block and item limit.
 */
export default function ServicesList({ data = {}, services = [] }) {
  if (services.length === 0) return null;

  return (
    <section className={`section ${data.background === 'white' ? '' : 'section--grey'}`}>
      <div className="container-x">
        <div className="services-grid">
          {services.map((service, i) => (
            <Reveal key={service.slug} delay={(i % 3) * 0.05}>
              <ServiceCard service={service} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
