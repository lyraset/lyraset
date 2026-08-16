// Relative, not aliased: this file is imported both by Next (where "@/" works)
// and directly by the plain-Node seed/sync scripts (where it doesn't).
import { CANONICAL_SITE_URL } from '../site.js';

/** Seed: global SEO defaults + Organization/LocalBusiness JSON-LD fields. */
export const seoDefault = {
  key: 'singleton',
  defaultTitle: 'LYRASET — International Marketing Agency',
  titleTemplate: '%s · LYRASET',
  defaultDescription:
    'Where strategy meets creativity to drive growth, engagement, and real business results. Data-driven marketing engineered by LYRASET.',
  defaultKeywords: [
    'digital marketing agency',
    'social media marketing',
    'paid ads management',
    'SEO services',
    'video production',
    'brand strategy',
  ],
  defaultOgImage: {},
  twitterHandle: '@lyraset',
  verification: { google: '', bing: '', pinterest: '' },
  organization: {
    name: 'LYRASET',
    legalName: 'LYRASET International Marketing Agency',
    url: CANONICAL_SITE_URL,
    logo: '',
    description:
      'LYRASET is an international marketing agency pairing strategy with creative production — paid ads, social, video, SEO and web — measured against the numbers clients actually care about.',
    employeeCount: '12',
    sameAs: [
      'https://instagram.com/lyraset',
      'https://facebook.com/lyraset',
      'https://x.com/lyraset',
      'https://linkedin.com/company/lyraset',
    ],
    foundingDate: '2022',
  },
  localBusiness: {
    enabled: true,
    type: 'ProfessionalService',
    priceRange: '$$',
    areaServed: ['Worldwide'],
    openingHours: ['Mo-Fr 09:00-18:00'],
  },
  structuredData: {
    website: true,
    organization: true,
    localBusiness: true,
    breadcrumbs: true,
    // Off until a real search endpoint exists — declaring it without one is a
    // spec violation Google will flag.
    searchAction: false,
  },
};

export default seoDefault;
