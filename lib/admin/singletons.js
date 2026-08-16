/**
 * Field schemas for the two singleton documents: Site Settings and SEO
 * defaults. These drive their editor forms (same FieldRenderer engine as the
 * content resources).
 */

export const SETTINGS_SCHEMA = [
  { name: 'brandName', label: 'Brand name', type: 'text' },
  { name: 'tagline', label: 'Tagline', type: 'textarea', full: true },
  { name: 'logoLight', label: 'Logo (light bg)', type: 'media' },
  { name: 'logoDark', label: 'Logo (dark bg)', type: 'media' },
  { name: 'phones', label: 'Phone numbers', type: 'stringList' },
  { name: 'emails', label: 'Email addresses', type: 'stringList' },
  { name: 'whatsapp', label: 'WhatsApp number', type: 'text' },
  { name: 'whatsappTemplate', label: 'WhatsApp prefilled message', type: 'textarea', full: true },
  { name: 'platforms', label: 'Platform ticker items', type: 'stringList', full: true },
  {
    name: 'offices',
    label: 'Offices',
    type: 'objectList',
    itemLabel: 'Office',
    full: true,
    fields: [
      { name: 'label', label: 'Label', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'lat', label: 'Latitude', type: 'number' },
      { name: 'lng', label: 'Longitude', type: 'number' },
    ],
  },
  {
    name: 'stats',
    label: 'Stats bar',
    type: 'objectList',
    itemLabel: 'Stat',
    full: true,
    fields: [
      { name: 'number', label: 'Number (counts up to)', type: 'number' },
      { name: 'prefix', label: 'Prefix', type: 'text' },
      { name: 'suffix', label: 'Suffix', type: 'text' },
      { name: 'label', label: 'Label', type: 'text' },
    ],
  },
  { name: 'socials', label: 'Social links', type: 'socials', full: true },
  {
    name: 'announcement',
    label: 'Announcement / promo bar',
    type: 'object',
    full: true,
    fields: [
      { name: 'active', label: 'Active', type: 'boolean' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'text', label: 'Text', type: 'textarea' },
      { name: 'image', label: 'Image', type: 'media' },
      { name: 'ctaLabel', label: 'CTA label', type: 'text' },
      { name: 'ctaHref', label: 'CTA link', type: 'text' },
    ],
  },
  { name: 'footerTagline', label: 'Footer tagline', type: 'textarea', full: true },
  { name: 'footerCredit', label: 'Footer credit', type: 'text' },
  { name: 'ga4Id', label: 'GA4 Measurement ID', type: 'text' },
  { name: 'metaPixelId', label: 'Meta Pixel ID', type: 'text' },
];

export const SEO_SCHEMA = [
  { name: 'defaultTitle', label: 'Default title', type: 'text', full: true },
  { name: 'titleTemplate', label: 'Title template (use %s)', type: 'text' },
  { name: 'twitterHandle', label: 'Twitter handle', type: 'text' },
  { name: 'defaultDescription', label: 'Default meta description', type: 'textarea', full: true },
  { name: 'defaultKeywords', label: 'Default keywords', type: 'stringList', full: true },
  { name: 'defaultOgImage', label: 'Default social share image', type: 'media', full: true },
  {
    name: 'verification',
    label: 'Search engine verification codes',
    type: 'object',
    full: true,
    fields: [
      { name: 'google', label: 'Google Search Console', type: 'text' },
      { name: 'bing', label: 'Bing Webmaster', type: 'text' },
      { name: 'pinterest', label: 'Pinterest', type: 'text' },
    ],
  },
  {
    name: 'organization',
    label: 'Organization (JSON-LD)',
    type: 'object',
    full: true,
    fields: [
      { name: 'name', label: 'Name', type: 'text' },
      { name: 'legalName', label: 'Legal name', type: 'text' },
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'logo', label: 'Logo URL', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'foundingDate', label: 'Founding year', type: 'text' },
      { name: 'employeeCount', label: 'Number of employees', type: 'text' },
      {
        name: 'sameAs',
        label: 'Social profile URLs (schema.org sameAs — wins over Site Settings)',
        type: 'stringList',
      },
    ],
  },
  {
    name: 'localBusiness',
    label: 'Local business (JSON-LD)',
    type: 'object',
    full: true,
    fields: [
      { name: 'enabled', label: 'Emit local-business markup', type: 'boolean' },
      {
        name: 'type',
        label: 'Business type',
        type: 'select',
        options: [
          { value: 'ProfessionalService', label: 'Professional Service' },
          { value: 'AdvertisingAgency', label: 'Advertising Agency' },
          { value: 'LocalBusiness', label: 'Local Business' },
          { value: 'Organization', label: 'Organization (no local data)' },
        ],
      },
      { name: 'priceRange', label: 'Price range (e.g. $$)', type: 'text' },
      { name: 'areaServed', label: 'Areas served', type: 'stringList' },
      { name: 'openingHours', label: 'Opening hours (e.g. Mo-Fr 09:00-18:00)', type: 'stringList' },
    ],
  },
  {
    name: 'structuredData',
    label: 'Structured data switches',
    type: 'object',
    full: true,
    fields: [
      { name: 'organization', label: 'Organization markup', type: 'boolean' },
      { name: 'website', label: 'WebSite markup', type: 'boolean' },
      { name: 'localBusiness', label: 'Local business overlay', type: 'boolean' },
      { name: 'breadcrumbs', label: 'Breadcrumb markup', type: 'boolean' },
      { name: 'searchAction', label: 'Sitelinks search box', type: 'boolean' },
    ],
  },
];
