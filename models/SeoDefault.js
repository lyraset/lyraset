import mongoose from 'mongoose';
import { MediaSchema, model } from './shared.js';

const { Schema } = mongoose;

/**
 * Global SEO + structured-data settings (singleton).
 *
 * Everything the site's JSON-LD emits that isn't page-specific is configured
 * here, so the schema markup can be retuned from the admin without a deploy.
 * Contact details, addresses and social profiles are NOT duplicated here —
 * those come from Site Settings, which stays the single source for them.
 */
const SeoDefaultSchema = new Schema(
  {
    key: { type: String, default: 'singleton', unique: true },
    defaultTitle: { type: String, default: 'LYRASET — International Marketing Agency' },
    titleTemplate: { type: String, default: '%s · LYRASET' },
    defaultDescription: { type: String, default: '' },
    defaultKeywords: { type: [String], default: [] },
    defaultOgImage: { type: MediaSchema, default: () => ({}) },
    twitterHandle: { type: String, default: '' },

    /** Search Console / Bing / Pinterest meta verification tokens. */
    verification: {
      google: { type: String, default: '' },
      bing: { type: String, default: '' },
      pinterest: { type: String, default: '' },
    },

    organization: {
      name: { type: String, default: 'LYRASET' },
      legalName: { type: String, default: 'LYRASET International Marketing Agency' },
      url: { type: String, default: '' },
      logo: { type: String, default: '' },
      sameAs: { type: [String], default: [] },
      foundingDate: { type: String, default: '2022' },
      description: { type: String, default: '' },
      /** Free-text; emitted as numberOfEmployees when it parses as a number. */
      employeeCount: { type: String, default: '' },
    },

    /**
     * LocalBusiness overlay. Addresses and geo come from Site Settings →
     * Offices; these are the fields schema.org wants that aren't already there.
     */
    localBusiness: {
      enabled: { type: Boolean, default: true },
      type: {
        type: String,
        enum: ['ProfessionalService', 'LocalBusiness', 'Organization', 'AdvertisingAgency'],
        default: 'ProfessionalService',
      },
      priceRange: { type: String, default: '$$' },
      areaServed: { type: [String], default: [] },
      openingHours: { type: [String], default: [] }, // e.g. "Mo-Fr 09:00-18:00"
    },

    /**
     * Master switches for the site-wide JSON-LD graph.
     * Named `structuredData`, not `schema` — Mongoose reserves `schema` on
     * documents, and a path with that name breaks model compilation.
     */
    structuredData: {
      website: { type: Boolean, default: true },
      organization: { type: Boolean, default: true },
      localBusiness: { type: Boolean, default: true },
      breadcrumbs: { type: Boolean, default: true },
      /** Enables the sitelinks search box; needs a working /portfolio?q= route. */
      searchAction: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default model('SeoDefault', SeoDefaultSchema);
