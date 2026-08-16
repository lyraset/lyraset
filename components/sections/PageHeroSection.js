import Link from 'next/link';
import PageHero from '@/components/PageHero';
import Icon from '@/components/Icon';
import { whatsappLink } from '@/lib/utils';

/**
 * CMS-driven wrapper around PageHero — the compact hero used by every index
 * page (services, portfolio, team, careers, contact).
 *
 * CTA hrefs support two tokens so contact details stay in Site Settings rather
 * than being pasted into each page:
 *   {whatsapp}  → wa.me link built from the WhatsApp number + template
 *   {email}     → mailto: the first configured address
 * A CTA whose token has no value configured is dropped rather than rendered
 * as a dead link.
 */

const BTN_CLASS = {
  primary: 'btn btn-primary',
  ghost: 'btn btn-ghost',
  'ghost-dark': 'btn btn-ghost-dark',
  whatsapp: 'btn btn-wa',
};

function resolveHref(href = '', settings = {}) {
  if (href === '{whatsapp}') {
    return settings.whatsapp ? whatsappLink(settings.whatsapp, settings.whatsappTemplate) : null;
  }
  if (href === '{email}') {
    return settings.emails?.[0] ? `mailto:${settings.emails[0]}` : null;
  }
  if (href === '{phone}') {
    return settings.phones?.[0] ? `tel:${settings.phones[0].replace(/\s/g, '')}` : null;
  }
  return href || null;
}

export default function PageHeroSection({ data = {}, settings = {} }) {
  const ctas = (data.ctas || [])
    .map((cta) => ({ ...cta, url: resolveHref(cta.href, settings) }))
    .filter((cta) => cta.url && cta.label);

  return (
    <PageHero
      eyebrow={data.eyebrow}
      title={data.title}
      subtitle={data.subtitle}
      dark={data.dark !== false}
    >
      {ctas.length > 0 && (
        <div className="contact-hero__ctas">
          {ctas.map((cta) => {
            const className = BTN_CLASS[cta.style] || BTN_CLASS.primary;
            const external = /^(https?:|mailto:|tel:)/.test(cta.url);
            const inner = (
              <>
                {cta.icon && <Icon name={cta.icon} size={18} />} {cta.label}
                {!cta.icon && (
                  <span className="btn-arrow">
                    <Icon name="arrow-right" size={16} />
                  </span>
                )}
              </>
            );

            return external ? (
              <a
                key={`${cta.label}-${cta.url}`}
                href={cta.url}
                className={className}
                {...(cta.url.startsWith('http')
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {inner}
              </a>
            ) : (
              <Link key={`${cta.label}-${cta.url}`} href={cta.url} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </PageHero>
  );
}
