import PortfolioGrid from '@/components/PortfolioGrid';
import '@/styles/portfolio.scss';

/** The filterable case-study grid used by /portfolio. */
export default function PortfolioGallery({ data = {}, caseStudies = [], categories = [] }) {
  if (caseStudies.length === 0) return null;

  return (
    <section className={`section ${data.background === 'grey' ? 'section--grey' : ''}`}>
      <div className="container-x">
        <PortfolioGrid items={caseStudies} categories={categories} />
      </div>
    </section>
  );
}
