import LeadForm from '@/components/forms/LeadForm';
import ContactMap from '@/components/ContactMap';
import SectionHeader from '@/components/SectionHeader';
import Icon from '@/components/Icon';
import { whatsappLink } from '@/lib/utils';
import '@/styles/contact.scss';

/**
 * The /contact body: lead forms on the left, contact details + map on the right.
 *
 * The forms are CMS-defined (label, hint, source tag, row count) so the admin
 * can add a third intake form or retitle the existing two. Phone/email/socials/
 * offices all come from Site Settings — this section never stores them.
 */
export default function ContactBlock({ data = {}, settings = {} }) {
  const wa = settings?.whatsapp
    ? whatsappLink(settings.whatsapp, settings.whatsappTemplate)
    : null;
  const email = settings?.emails?.[0];
  const phone = settings?.phones?.[0];
  const offices = settings?.offices || [];
  const socials = settings?.socials || [];

  const forms =
    data.forms?.length > 0
      ? data.forms
      : [
          {
            eyebrow: 'Quick Message',
            heading: 'Send us a note',
            hint: "A quick hello or a question — we'll get right back to you.",
            source: 'contact',
            buttonLabel: 'Send Message',
          },
          {
            eyebrow: 'Detailed Brief',
            heading: 'Tell us everything',
            hint: 'Share your goals, timeline, and budget for a tailored proposal.',
            source: 'brief',
            buttonLabel: 'Send Brief',
            rows: 7,
          },
        ];

  return (
    <section className="section">
      <div className="container-x contact-grid">
        <div className="contact-forms">
          {forms.map((form, i) => (
            <div className="contact-card" key={form.source || i}>
              <SectionHeader eyebrow={form.eyebrow} heading={form.heading} />
              {form.hint && <p className="contact-card__hint">{form.hint}</p>}
              <LeadForm
                source={form.source || 'contact'}
                buttonLabel={form.buttonLabel || 'Send'}
                rows={form.rows || undefined}
              />
            </div>
          ))}
        </div>

        <aside className="contact-info">
          <div className="contact-info__panel">
            <h3 className="contact-info__heading">{data.infoHeading || 'Contact Info'}</h3>
            <p className="contact-info__reply">
              <Icon name="check" size={14} />{' '}
              {data.replyPromise || 'We reply within one business day'}
            </p>

            {phone && (
              <a className="contact-info__row" href={`tel:${phone.replace(/\s/g, '')}`}>
                <span className="contact-info__icon">
                  <Icon name="phone" size={18} />
                </span>
                <span>
                  <span className="contact-info__label">Phone</span>
                  {phone}
                </span>
              </a>
            )}
            {email && (
              <a className="contact-info__row" href={`mailto:${email}`}>
                <span className="contact-info__icon">
                  <Icon name="mail" size={18} />
                </span>
                <span>
                  <span className="contact-info__label">Email</span>
                  {email}
                </span>
              </a>
            )}

            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-wa contact-info__wa"
              >
                <Icon name="whatsapp" size={18} />{' '}
                {data.whatsappLabel || 'Message us on WhatsApp'}
              </a>
            )}

            {data.showMap !== false && <ContactMap offices={offices} />}

            {offices.length > 0 && (
              <div className="contact-info__offices">
                {offices.map((o) => {
                  const query = o.lat && o.lng ? `${o.lat},${o.lng}` : o.address;
                  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                  return (
                    <div className="contact-info__office" key={o.label}>
                      <span className="contact-info__icon">
                        <Icon name="map-pin" size={18} />
                      </span>
                      <span>
                        <span className="contact-info__label">{o.label}</span>
                        {o.address}
                        <a
                          className="contact-info__directions"
                          href={mapHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Get directions <Icon name="arrow-right" size={14} />
                        </a>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {socials.length > 0 && (
              <div className="contact-info__socials">
                {socials.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.platform}
                  >
                    <Icon name={s.platform} size={18} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
