import dynamic from 'next/dynamic';
import {
  getServices,
  getCaseStudies,
  getTestimonials,
  getSettings,
  getCategories,
  getTeam,
  getJobs,
} from '@/lib/data';
import PlatformMarquee from './PlatformMarquee';
import ServicesGrid from './ServicesGrid';
import PortfolioPreview from './PortfolioPreview';
import ProcessTimeline from './ProcessTimeline';
import MissionColumns from './MissionColumns';
import ValuesBand from './ValuesBand';
import WorkWithUsForm from './WorkWithUsForm';
import AboutBlocks from './AboutBlocks';
import RichText from './RichText';
import CtaMarquee from './CtaMarquee';
import PageHeroSection from './PageHeroSection';
import ServicesList from './ServicesList';
import PortfolioGallery from './PortfolioGallery';
import TeamGrid from './TeamGrid';
import JobsList from './JobsList';
import ContactBlock from './ContactBlock';
import FaqSection from './FaqSection';

// Framer-Motion-heavy sections are code-split so pages that don't use them
// (e.g. privacy/terms) never ship the animation runtime. They still SSR.
const Hero = dynamic(() => import('./Hero'));
const StatsBar = dynamic(() => import('./StatsBar'));
const TestimonialSlider = dynamic(() => import('./TestimonialSlider'));

/**
 * Maps a page's ordered section records to components, fetching only the data
 * the present section types require. This is the runtime half of the "every
 * page is composable" model — adding a new section instance in the CMS renders
 * with zero code changes.
 */
export default async function SectionRenderer({ sections = [], settings }) {
  const types = new Set(sections.map((s) => s.type));
  const needs = (...keys) => keys.some((k) => types.has(k));

  const [services, caseStudies, testimonials, categories, team, jobs, site] = await Promise.all([
    needs('servicesGrid', 'servicesList') ? getServices() : Promise.resolve([]),
    needs('portfolioPreview', 'portfolioGallery') ? getCaseStudies() : Promise.resolve([]),
    needs('testimonialSlider') ? getTestimonials() : Promise.resolve([]),
    needs('portfolioGallery') ? getCategories() : Promise.resolve([]),
    needs('teamGrid') ? getTeam() : Promise.resolve([]),
    needs('jobsList') ? getJobs() : Promise.resolve([]),
    settings ? Promise.resolve(settings) : getSettings(),
  ]);

  return (
    <>
      {sections.map((section) => {
        const key = section._id;
        const data = section.data || {};
        switch (section.type) {
          case 'hero':
            return <Hero key={key} data={data} settings={site} />;
          case 'pageHero':
            return <PageHeroSection key={key} data={data} settings={site} />;
          case 'statsBar':
            return <StatsBar key={key} stats={site?.stats || []} />;
          case 'platformMarquee':
            return <PlatformMarquee key={key} platforms={site?.platforms || []} />;
          case 'servicesGrid':
            return <ServicesGrid key={key} data={data} services={services} />;
          case 'servicesList':
            return <ServicesList key={key} data={data} services={services} />;
          case 'portfolioPreview':
            return <PortfolioPreview key={key} data={data} caseStudies={caseStudies} />;
          case 'portfolioGallery':
            return (
              <PortfolioGallery
                key={key}
                data={data}
                caseStudies={caseStudies}
                categories={categories}
              />
            );
          case 'teamGrid':
            return <TeamGrid key={key} data={data} team={team} />;
          case 'jobsList':
            return <JobsList key={key} data={data} jobs={jobs} />;
          case 'contactBlock':
            return <ContactBlock key={key} data={data} settings={site} />;
          case 'faq':
            return <FaqSection key={key} data={data} />;
          case 'processTimeline':
            return <ProcessTimeline key={key} data={data} />;
          case 'testimonialSlider':
            return <TestimonialSlider key={key} data={data} testimonials={testimonials} />;
          case 'missionColumns':
            return <MissionColumns key={key} data={data} />;
          case 'valuesBand':
            return <ValuesBand key={key} data={data} />;
          case 'workWithUsForm':
            return <WorkWithUsForm key={key} data={data} id="contact" />;
          case 'aboutBlocks':
            return <AboutBlocks key={key} data={data} />;
          case 'richText':
            return <RichText key={key} data={data} />;
          case 'ctaMarquee':
            return <CtaMarquee key={key} data={data} />;
          default:
            return null;
        }
      })}
    </>
  );
}
