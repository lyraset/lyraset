import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Reusable embedded schema for a Cloudinary media reference. Used everywhere a
 * document points at an image/video/PDF. `alt` is required in the CMS for
 * accessibility (enforced at the form layer).
 */
export const MediaSchema = new Schema(
  {
    publicId: { type: String, default: '' },
    url: { type: String, default: '' },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
    width: Number,
    height: Number,
    format: String,
    alt: { type: String, default: '' },
  },
  { _id: false }
);

/** A question/answer pair. Rendered on the page AND emitted as FAQPage JSON-LD. */
export const FaqSchema = new Schema(
  {
    question: { type: String, default: '' },
    answer: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * Reusable embedded SEO block for per-entity overrides.
 *
 * Covers three concerns the admin controls per page:
 *   - metadata      title/description/ogImage/canonical
 *   - indexing      noindex (also drives robots.txt + sitemap exclusion),
 *                   sitemapExclude, priority, changeFrequency
 *   - structured    schemaType picks the WebPage subtype; faq emits FAQPage
 */
export const SeoSchema = new Schema(
  {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    keywords: { type: [String], default: [] },
    ogImage: { type: MediaSchema, default: () => ({}) },
    canonical: { type: String, default: '' },
    noindex: { type: Boolean, default: false },

    // Sitemap controls (blank/undefined = use the route defaults in lib/routes).
    sitemapExclude: { type: Boolean, default: false },
    priority: { type: Number, default: null },
    changeFrequency: {
      type: String,
      enum: ['', 'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'],
      default: '',
    },

    // Structured data.
    schemaType: {
      type: String,
      enum: ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'FAQPage', 'ProfilePage'],
      default: 'WebPage',
    },
    faq: { type: [FaqSchema], default: [] },
  },
  { _id: false }
);

/** A CTA button (label + href). */
export const CtaSchema = new Schema(
  {
    label: { type: String, default: '' },
    href: { type: String, default: '' },
    style: { type: String, enum: ['primary', 'ghost', 'ghost-dark'], default: 'primary' },
  },
  { _id: false }
);

/** Prevent OverwriteModelError across hot-reloads / serverless invocations. */
export function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}
