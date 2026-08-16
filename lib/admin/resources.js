/**
 * Declarative admin resource config: for each content collection, the field
 * schema drives the editor form and the columns drive the list table. One data
 * file replaces a dozen hand-written editors — and adding a field is a one-line
 * change here.
 */

/**
 * Per-entity SEO + structured-data fields. Shared by every resource that has a
 * public URL, and by the Pages editor, so "what can I control per page" is the
 * same list everywhere.
 *
 * `noindex` is load-bearing beyond the meta tag: it also removes the URL from
 * sitemap.xml and adds it to robots.txt Disallow.
 */
export const SEO_FIELDS = [
  { name: 'title', label: 'Meta title', type: 'text' },
  { name: 'description', label: 'Meta description', type: 'textarea' },
  { name: 'keywords', label: 'Keywords', type: 'stringList' },
  { name: 'ogImage', label: 'Social share image', type: 'media' },
  { name: 'canonical', label: 'Canonical URL (leave blank to auto-generate)', type: 'text' },
  {
    name: 'schemaType',
    label: 'Schema.org page type',
    type: 'select',
    options: [
      { value: 'WebPage', label: 'WebPage (default)' },
      { value: 'AboutPage', label: 'AboutPage' },
      { value: 'ContactPage', label: 'ContactPage' },
      { value: 'CollectionPage', label: 'CollectionPage (listings)' },
      { value: 'FAQPage', label: 'FAQPage' },
      { value: 'ProfilePage', label: 'ProfilePage' },
    ],
  },
  { name: 'noindex', label: 'Hide from search engines', type: 'boolean' },
  { name: 'sitemapExclude', label: 'Exclude from sitemap only', type: 'boolean' },
  {
    name: 'priority',
    label: 'Sitemap priority (0–1, blank = auto)',
    type: 'number',
  },
  {
    name: 'changeFrequency',
    label: 'Sitemap change frequency',
    type: 'select',
    options: [
      { value: '', label: 'Auto' },
      { value: 'always', label: 'Always' },
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'yearly', label: 'Yearly' },
      { value: 'never', label: 'Never' },
    ],
  },
  {
    name: 'faq',
    label: 'FAQ (emits FAQPage rich-result markup)',
    type: 'objectList',
    itemLabel: 'Q&A',
    full: true,
    fields: [
      { name: 'question', label: 'Question', type: 'text' },
      { name: 'answer', label: 'Answer', type: 'textarea' },
    ],
  },
];

const seoField = {
  name: 'seo',
  label: 'SEO & structured data',
  type: 'object',
  fields: SEO_FIELDS,
};

const iconOptions = [
  'globe',
  'meta',
  'search',
  'chat',
  'trending',
  'video',
  'brand',
  'data',
  'mail',
  'strategy',
  'sparkles',
  'palette',
  'smartphone',
  'megaphone',
  'trending-up',
  'share-2',
  'file-text',
  'pen-tool',
  'award',
  'image',
  'layout',
  'shopping-cart',
].map((v) => ({ value: v, label: v }));

export const RESOURCES = {
  services: {
    resource: 'services',
    label: 'Service',
    plural: 'Services',
    hasSlug: true,
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'iconKey', label: 'Icon' },
      { key: 'featured', label: 'Featured', type: 'boolean' },
      { key: 'published', label: 'Published', type: 'boolean' },
      { key: 'order', label: 'Order' },
    ],
    schema: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'slug' },
      { name: 'iconKey', label: 'Icon', type: 'select', options: iconOptions },
      { name: 'shortBlurb', label: 'Short blurb (2 lines)', type: 'textarea', full: true },
      { name: 'heroHeadline', label: 'Hero headline', type: 'text', full: true },
      { name: 'description', label: 'Rich description', type: 'richtext', full: true },
      { name: 'deliverables', label: 'Deliverables', type: 'stringList', full: true },
      { name: 'formTitle', label: 'Lead form title', type: 'text' },
      { name: 'formEnabled', label: 'Show lead form', type: 'boolean' },
      { name: 'heroImage', label: 'Hero illustration', type: 'media', full: true },
      { name: 'gallery', label: 'Gallery', type: 'mediaList', full: true },
      { name: 'featured', label: 'Featured', type: 'boolean' },
      { name: 'published', label: 'Published', type: 'boolean' },
      { name: 'order', label: 'Order', type: 'number' },
      { ...seoField, full: true },
    ],
    defaults: { formEnabled: true, published: true, featured: false, order: 0, iconKey: 'sparkles' },
  },

  portfolio: {
    resource: 'case-studies',
    label: 'Case study',
    plural: 'Portfolio',
    hasSlug: true,
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'categoryName', label: 'Category' },
      { key: 'client', label: 'Client' },
      { key: 'published', label: 'Published', type: 'boolean' },
      { key: 'order', label: 'Order' },
    ],
    schema: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'slug' },
      { name: 'categorySlug', label: 'Category slug', type: 'text' },
      { name: 'categoryName', label: 'Category name', type: 'text' },
      { name: 'client', label: 'Client', type: 'text' },
      { name: 'summary', label: 'Summary', type: 'textarea', full: true },
      { name: 'coverImage', label: 'Cover image', type: 'media', full: true },
      { name: 'challenge', label: 'The challenge', type: 'richtext', full: true },
      { name: 'approach', label: 'Our approach', type: 'richtext', full: true },
      { name: 'results', label: 'The results', type: 'richtext', full: true },
      {
        name: 'metrics',
        label: 'Metric highlights',
        type: 'objectList',
        itemLabel: 'Metric',
        full: true,
        fields: [
          { name: 'label', label: 'Label', type: 'text' },
          { name: 'value', label: 'Value', type: 'text' },
        ],
      },
      { name: 'gallery', label: 'Gallery', type: 'mediaList', full: true },
      { name: 'featured', label: 'Featured', type: 'boolean' },
      { name: 'published', label: 'Published', type: 'boolean' },
      { name: 'order', label: 'Order', type: 'number' },
      { ...seoField, full: true },
    ],
    defaults: { published: true, featured: false, order: 0 },
  },

  team: {
    resource: 'team',
    label: 'Team member',
    plural: 'Team',
    hasSlug: false,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'type', label: 'Type' },
      { key: 'visible', label: 'Visible', type: 'boolean' },
      { key: 'order', label: 'Order' },
    ],
    schema: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'text' },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'individual', label: 'Individual' },
          { value: 'group', label: 'Group' },
        ],
      },
      { name: 'photo', label: 'Photo', type: 'media', full: true },
      { name: 'bio', label: 'Bio', type: 'richtext', full: true },
      { name: 'skills', label: 'Skills', type: 'stringList', full: true },
      { name: 'socials', label: 'Social links', type: 'socials', full: true },
      { name: 'visible', label: 'Visible', type: 'boolean' },
      { name: 'order', label: 'Order', type: 'number' },
    ],
    defaults: { type: 'individual', visible: true, order: 0 },
  },

  testimonials: {
    resource: 'testimonials',
    label: 'Testimonial',
    plural: 'Testimonials',
    hasSlug: false,
    columns: [
      { key: 'author', label: 'Author' },
      { key: 'role', label: 'Role' },
      { key: 'rating', label: 'Rating' },
      { key: 'visible', label: 'Visible', type: 'boolean' },
      { key: 'order', label: 'Order' },
    ],
    schema: [
      { name: 'author', label: 'Author', type: 'text', required: true },
      { name: 'role', label: 'Role / company', type: 'text' },
      { name: 'headline', label: 'Headline', type: 'text', full: true },
      { name: 'quote', label: 'Quote', type: 'textarea', full: true, required: true },
      { name: 'avatar', label: 'Avatar', type: 'media', full: true },
      { name: 'rating', label: 'Rating (0–5)', type: 'number' },
      { name: 'visible', label: 'Visible', type: 'boolean' },
      { name: 'order', label: 'Order', type: 'number' },
    ],
    defaults: { rating: 5, visible: true, order: 0 },
  },

  careers: {
    resource: 'jobs',
    label: 'Job',
    plural: 'Careers',
    hasSlug: true,
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'employmentType', label: 'Type' },
      { key: 'location', label: 'Location' },
      { key: 'open', label: 'Open', type: 'boolean' },
      { key: 'order', label: 'Order' },
    ],
    schema: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'slug' },
      { name: 'employmentType', label: 'Employment type', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'summary', label: 'Summary', type: 'textarea', full: true },
      { name: 'responsibilities', label: "What you'll do", type: 'stringList', full: true },
      { name: 'requirements', label: "What we're looking for", type: 'stringList', full: true },
      { name: 'open', label: 'Open', type: 'boolean' },
      { name: 'order', label: 'Order', type: 'number' },
      { ...seoField, full: true },
    ],
    defaults: { employmentType: 'Full-time', open: true, order: 0 },
  },

  categories: {
    resource: 'categories',
    label: 'Category',
    plural: 'Categories',
    hasSlug: true,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'order', label: 'Order' },
    ],
    schema: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'slug' },
      { name: 'order', label: 'Order', type: 'number' },
    ],
    defaults: { order: 0 },
  },
};

export function getResourceConfig(key) {
  return RESOURCES[key];
}
