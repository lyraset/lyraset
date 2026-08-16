import { absoluteUrl, getSiteUrl } from '@/lib/site';

/**
 * JSON-LD builders.
 *
 * The site emits one connected graph rather than a pile of disconnected
 * snippets: a single Organization and WebSite node live at stable @ids, and
 * every page node references them instead of restating the company details.
 * That is what lets Google merge the signals into one entity.
 *
 *   {site}/#organization   the company (also the LocalBusiness node)
 *   {site}/#website        the site itself
 *   {url}#webpage          the current page, isPartOf the website
 *   {url}#breadcrumb       that page's trail
 *
 * Every builder is a pure function returning a plain object, so they can be
 * unit-tested and composed without touching React or the database.
 */

/** Stable @id for the Organization node. */
export const ORG_ID = () => `${getSiteUrl()}/#organization`;
/** Stable @id for the WebSite node. */
export const SITE_ID = () => `${getSiteUrl()}/#website`;

/**
 * Recursively drop empty values so the emitted JSON-LD has no null/""/[] noise
 * — Google ignores them, but they make the output impossible to eyeball.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function prune(value) {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = prune(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === '' || value === undefined) return undefined;
  return value;
}

/** Strip HTML tags and collapse whitespace — rich-text fields into plain text. */
export function toPlainText(html = '', max = 500) {
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/g, (m) => ({
      '&nbsp;': ' ',
      '&amp;': '&',
      '&quot;': '"',
      '&#39;': "'",
      '&lt;': '<',
      '&gt;': '>',
    })[m] || ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Merge social profile URLs down to one per platform.
 *
 * Two places hold social links: SEO → Organization → sameAs (the field that
 * exists specifically for this markup) and Site Settings → Socials (which also
 * drives the visible footer icons). Emitting both unfiltered would claim two
 * accounts per platform, so the SEO list wins on any domain it covers and
 * Site Settings fills in the platforms it doesn't.
 *
 * If the two disagree, that's a content problem worth fixing at the source —
 * this only stops the disagreement reaching Google.
 *
 * @param {string[]} sameAs - SeoDefault.organization.sameAs (authoritative)
 * @param {Array<{url: string}>} socials - SiteSettings.socials (fallback)
 * @returns {string[]}
 */
function mergeSameAs(sameAs = [], socials = []) {
  const byHost = new Map();

  const host = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return url;
    }
  };

  for (const url of [...sameAs, ...socials.map((s) => s?.url)]) {
    if (!url) continue;
    const key = host(url);
    if (!byHost.has(key)) byHost.set(key, url);
  }

  return [...byHost.values()];
}

/** Office record → schema.org PostalAddress. */
function postalAddress(office = {}) {
  return prune({
    '@type': 'PostalAddress',
    name: office.label,
    streetAddress: office.address,
    addressCountry: office.country,
    addressLocality: office.city,
    addressRegion: office.region,
    postalCode: office.postalCode,
  });
}

/** Office record → schema.org GeoCoordinates (only when both values exist). */
function geo(office = {}) {
  if (typeof office.lat !== 'number' || typeof office.lng !== 'number') return undefined;
  return { '@type': 'GeoCoordinates', latitude: office.lat, longitude: office.lng };
}

/**
 * The Organization node, doubling as LocalBusiness when enabled.
 *
 * Deliberately omits aggregateRating: Google treats self-hosted ratings on your
 * own Organization as self-serving and ignores or penalises them. Client
 * testimonials render as page content only.
 *
 * @param {object} opts
 * @param {object} opts.settings - Site Settings document
 * @param {object} opts.seo - SeoDefault document
 */
export function organizationSchema({ settings = {}, seo = {} } = {}) {
  const org = seo.organization || {};
  const lb = seo.localBusiness || {};
  const offices = settings.offices || [];
  const useLocalBusiness = lb.enabled !== false && seo.structuredData?.localBusiness !== false;

  const employees = Number(org.employeeCount);

  return prune({
    '@type': useLocalBusiness ? lb.type || 'ProfessionalService' : 'Organization',
    '@id': ORG_ID(),
    name: org.name || settings.brandName || 'LYRASET',
    legalName: org.legalName,
    alternateName: settings.brandName !== org.name ? settings.brandName : undefined,
    url: getSiteUrl(),
    logo: prune({
      '@type': 'ImageObject',
      url: org.logo || settings.logoDark?.url || absoluteUrl('/icon.png'),
    }),
    image: org.logo || settings.logoDark?.url || absoluteUrl('/icon.png'),
    description: org.description || seo.defaultDescription || settings.tagline,
    foundingDate: org.foundingDate,
    numberOfEmployees: Number.isFinite(employees) && employees > 0 ? employees : undefined,
    email: settings.emails?.[0],
    telephone: settings.phones?.[0],
    sameAs: mergeSameAs(org.sameAs, settings.socials),
    address: offices.length ? offices.map(postalAddress) : undefined,
    location: useLocalBusiness
      ? offices
          .map((o) =>
            prune({ '@type': 'Place', name: o.label, address: postalAddress(o), geo: geo(o) })
          )
          .filter(Boolean)
      : undefined,
    geo: useLocalBusiness ? geo(offices[0] || {}) : undefined,
    priceRange: useLocalBusiness ? lb.priceRange : undefined,
    areaServed: lb.areaServed?.length
      ? lb.areaServed.map((a) => ({ '@type': 'Place', name: a }))
      : undefined,
    openingHours: useLocalBusiness && lb.openingHours?.length ? lb.openingHours : undefined,
    contactPoint: settings.phones?.length
      ? prune({
          '@type': 'ContactPoint',
          contactType: 'customer service',
          telephone: settings.phones[0],
          email: settings.emails?.[0],
          areaServed: lb.areaServed?.length ? lb.areaServed : undefined,
          availableLanguage: ['en'],
        })
      : undefined,
  });
}

/**
 * The WebSite node. The sitelinks SearchAction is opt-in because declaring it
 * without a working search endpoint is a spec violation.
 */
export function websiteSchema({ settings = {}, seo = {} } = {}) {
  const enableSearch = seo.structuredData?.searchAction === true;
  return prune({
    '@type': 'WebSite',
    '@id': SITE_ID(),
    url: getSiteUrl(),
    name: seo.organization?.name || settings.brandName || 'LYRASET',
    description: seo.defaultDescription || settings.tagline,
    publisher: { '@id': ORG_ID() },
    inLanguage: 'en',
    potentialAction: enableSearch
      ? {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${getSiteUrl()}/portfolio?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        }
      : undefined,
  });
}

/**
 * A WebPage node for the current URL. `type` narrows it to AboutPage /
 * ContactPage / CollectionPage etc., which the CMS sets per page.
 */
export function webPageSchema({ path = '/', title, description, type = 'WebPage', image, updatedAt } = {}) {
  const url = absoluteUrl(path);
  return prune({
    '@type': type || 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { '@id': SITE_ID() },
    about: { '@id': ORG_ID() },
    primaryImageOfPage: image ? { '@type': 'ImageObject', url: image } : undefined,
    dateModified: updatedAt ? new Date(updatedAt).toISOString() : undefined,
    inLanguage: 'en',
  });
}

/**
 * BreadcrumbList for a trail of { name, path } crumbs. Home is prepended.
 * @param {Array<{name: string, path: string}>} trail
 */
export function breadcrumbSchema(trail = []) {
  const items = [{ name: 'Home', path: '/' }, ...trail];
  const last = items[items.length - 1];
  return prune({
    '@type': 'BreadcrumbList',
    '@id': `${absoluteUrl(last.path)}#breadcrumb`,
    itemListElement: items.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  });
}

/** FAQPage from CMS question/answer pairs. Returns undefined when empty. */
export function faqSchema(faqs = []) {
  const entries = (faqs || []).filter((f) => f.question && f.answer);
  if (!entries.length) return undefined;
  return prune({
    '@type': 'FAQPage',
    mainEntity: entries.map((f) => ({
      '@type': 'Question',
      name: toPlainText(f.question, 300),
      acceptedAnswer: { '@type': 'Answer', text: toPlainText(f.answer, 1200) },
    })),
  });
}

/** Service detail page. */
export function serviceSchema(service = {}) {
  const url = absoluteUrl(`/services/${service.slug}`);
  return prune({
    '@type': 'Service',
    '@id': `${url}#service`,
    name: service.title,
    serviceType: service.title,
    url,
    description: service.shortBlurb || toPlainText(service.description),
    provider: { '@id': ORG_ID() },
    image: service.heroImage?.url,
    areaServed: { '@type': 'Place', name: 'Worldwide' },
    hasOfferCatalog: service.deliverables?.length
      ? {
          '@type': 'OfferCatalog',
          name: `${service.title} deliverables`,
          itemListElement: service.deliverables.map((d) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: d },
          })),
        }
      : undefined,
  });
}

/** Case study → CreativeWork (an Article would misrepresent it as editorial). */
export function caseStudySchema(item = {}) {
  const url = absoluteUrl(`/portfolio/${item.slug}`);
  return prune({
    '@type': 'CreativeWork',
    '@id': `${url}#work`,
    name: item.title,
    headline: item.title,
    url,
    description: item.summary || toPlainText(item.challenge),
    image: item.coverImage?.url,
    genre: item.categoryName,
    creator: { '@id': ORG_ID() },
    about: item.client ? { '@type': 'Organization', name: item.client } : undefined,
    datePublished: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
    dateModified: item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
  });
}

/** Map the CMS's free-text employment type onto schema.org's enum. */
function employmentTypeEnum(value = '') {
  const key = String(value).toLowerCase().replace(/[\s-]/g, '');
  return (
    {
      fulltime: 'FULL_TIME',
      parttime: 'PART_TIME',
      contract: 'CONTRACTOR',
      contractor: 'CONTRACTOR',
      temporary: 'TEMPORARY',
      internship: 'INTERN',
      intern: 'INTERN',
      volunteer: 'VOLUNTEER',
      perdiem: 'PER_DIEM',
      other: 'OTHER',
    }[key] || undefined
  );
}

/**
 * JobPosting. Google requires title, description, datePosted, hiringOrganization
 * and jobLocation; validThrough is strongly recommended, so postings without an
 * explicit expiry get 90 days from datePosted.
 */
export function jobPostingSchema(job = {}, { settings = {} } = {}) {
  const url = absoluteUrl(`/careers/${job.slug}`);
  const posted = job.createdAt ? new Date(job.createdAt) : new Date();
  const validThrough = job.validThrough
    ? new Date(job.validThrough)
    : new Date(posted.getTime() + 90 * 24 * 60 * 60 * 1000);

  const description =
    [job.summary, ...(job.responsibilities || []), ...(job.requirements || [])]
      .filter(Boolean)
      .join('. ') || job.summary;

  return prune({
    '@type': 'JobPosting',
    '@id': `${url}#job`,
    title: job.title,
    description: toPlainText(description, 5000),
    url,
    datePosted: posted.toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType: employmentTypeEnum(job.employmentType),
    hiringOrganization: { '@id': ORG_ID() },
    directApply: true,
    jobLocation: job.location
      ? {
          '@type': 'Place',
          address: prune({
            '@type': 'PostalAddress',
            addressLocality: job.location,
            streetAddress: settings.offices?.[0]?.address,
          }),
        }
      : undefined,
  });
}

/** Team member → Person. */
export function personSchema(member = {}) {
  return prune({
    '@type': 'Person',
    name: member.name,
    jobTitle: member.role,
    description: toPlainText(member.bio, 300),
    image: member.photo?.url,
    worksFor: { '@id': ORG_ID() },
    knowsAbout: member.skills?.length ? member.skills : undefined,
    sameAs: (member.socials || []).map((s) => s.url).filter(Boolean),
  });
}

/**
 * The team roster as an ItemList of Person nodes. Team members have no
 * individual URLs, so they are embedded rather than linked.
 * @param {Array<object>} members
 */
export function personListSchema(members = []) {
  if (!members.length) return undefined;
  return prune({
    '@type': 'ItemList',
    name: 'Team',
    numberOfItems: members.length,
    itemListElement: members.map((member, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: personSchema(member),
    })),
  });
}

/**
 * ItemList for a listing page, so the set of links reads as an ordered
 * collection rather than N unrelated URLs.
 * @param {Array<{name: string, path: string}>} items
 */
export function itemListSchema(items = [], { name } = {}) {
  if (!items.length) return undefined;
  return prune({
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  });
}

/**
 * Wrap nodes into a single @graph document. One script tag per page beats
 * several disconnected ones — @id references only resolve within a graph.
 * @param {Array<object|undefined>} nodes
 */
export function graph(nodes = []) {
  const clean = nodes.filter(Boolean);
  if (!clean.length) return undefined;
  return { '@context': 'https://schema.org', '@graph': clean };
}
