import SectionHeader from '@/components/SectionHeader';
import Reveal from '@/components/motion/Reveal';
import Icon from '@/components/Icon';
import '@/styles/faq.scss';

/**
 * FAQ accordion.
 *
 * Built on native <details>/<summary>, so it expands with no JavaScript and
 * stays keyboard-accessible and printable. The same question/answer records
 * are emitted as FAQPage JSON-LD by the page — Google requires the answer text
 * to be visible on the page, which this satisfies (collapsed is still "visible"
 * for their purposes; hidden-behind-JS is not).
 */
export default function FaqSection({ data = {} }) {
  const items = (data.items || []).filter((f) => f.question && f.answer);
  if (items.length === 0) return null;

  return (
    <section className={`section ${data.background === 'grey' ? 'section--grey' : ''}`}>
      <div className="container-x">
        {(data.eyebrow || data.heading) && (
          <SectionHeader
            eyebrow={data.eyebrow}
            heading={data.heading}
            subheading={data.subheading}
          />
        )}
        <div className="faq-list">
          {items.map((item, i) => (
            <Reveal key={item.question} delay={(i % 4) * 0.04}>
              <details className="faq-item" name={data.exclusive === false ? undefined : 'faq'}>
                <summary className="faq-item__q">
                  <span>{item.question}</span>
                  <span className="faq-item__icon" aria-hidden="true">
                    <Icon name="chevron-down" size={18} />
                  </span>
                </summary>
                <div className="faq-item__a">
                  <p>{item.answer}</p>
                </div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
