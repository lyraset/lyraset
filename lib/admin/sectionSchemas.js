/**
 * Field schemas for every section type. The Pages editor uses these to render
 * an editor for whatever sections a page contains — and to offer the full set
 * when adding a new section. Adding a new section type here (plus a component in
 * SectionRenderer) is all it takes to expand the CMS.
 */

const ctaFields = [
  { name: 'label', label: 'Label', type: 'text' },
  { name: 'href', label: 'Link', type: 'text' },
  {
    name: 'style',
    label: 'Style',
    type: 'select',
    options: [
      { value: 'primary', label: 'Primary' },
      { value: 'ghost', label: 'Ghost' },
      { value: 'ghost-dark', label: 'Ghost (light bg)' },
    ],
  },
];

/**
 * CTA fields for the compact page hero. `href` accepts the tokens {whatsapp},
 * {email} and {phone}, resolved from Site Settings at render time so contact
 * details live in exactly one place.
 */
const pageHeroCtaFields = [
  { name: 'label', label: 'Label', type: 'text' },
  {
    name: 'href',
    label: 'Link ( /contact, https://…, or {whatsapp} / {email} / {phone} )',
    type: 'text',
  },
  {
    name: 'style',
    label: 'Style',
    type: 'select',
    options: [
      { value: 'primary', label: 'Primary' },
      { value: 'ghost', label: 'Ghost' },
      { value: 'ghost-dark', label: 'Ghost (light bg)' },
      { value: 'whatsapp', label: 'WhatsApp green' },
    ],
  },
  { name: 'icon', label: 'Icon (optional)', type: 'text' },
];

export const SECTION_SCHEMAS = {
  hero: {
    label: 'Hero',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'headlineLines', label: 'Headline lines', type: 'stringList' },
      { name: 'subline', label: 'Subline', type: 'textarea', full: true },
      { name: 'primaryCta', label: 'Primary CTA', type: 'object', fields: ctaFields },
      { name: 'secondaryCta', label: 'Secondary CTA', type: 'object', fields: ctaFields },
      { name: 'image', label: 'Illustration', type: 'media', full: true },
      { name: 'showStrip', label: 'Show phone/office strip', type: 'boolean' },
    ],
  },
  statsBar: { label: 'Stats Bar', fields: [], note: 'Values come from Site Settings → Stats.' },
  platformMarquee: {
    label: 'Platform Ticker',
    fields: [],
    note: 'Items come from Site Settings → Platform ticker.',
  },
  servicesGrid: {
    label: 'Services Grid',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'subheading', label: 'Subheading', type: 'textarea', full: true },
      { name: 'limit', label: 'Max services shown', type: 'number' },
    ],
  },
  portfolioPreview: {
    label: 'Portfolio Preview',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'subheading', label: 'Subheading', type: 'textarea', full: true },
      { name: 'limit', label: 'Max projects shown', type: 'number' },
    ],
  },
  processTimeline: {
    label: 'Process Timeline',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      {
        name: 'steps',
        label: 'Steps',
        type: 'objectList',
        itemLabel: 'Step',
        full: true,
        fields: [
          { name: 'level', label: 'Level label', type: 'text' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'body', label: 'Body', type: 'textarea' },
        ],
      },
    ],
  },
  testimonialSlider: {
    label: 'Testimonials',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
    ],
    note: 'Testimonials are managed in the Testimonials module.',
  },
  missionColumns: {
    label: 'Mission Columns',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      {
        name: 'columns',
        label: 'Columns',
        type: 'objectList',
        itemLabel: 'Column',
        full: true,
        fields: [
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'body', label: 'Body', type: 'textarea' },
        ],
      },
    ],
  },
  valuesBand: {
    label: 'Values Band',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'body', label: 'Body', type: 'textarea', full: true },
      { name: 'values', label: 'Values', type: 'stringList', full: true },
    ],
  },
  workWithUsForm: {
    label: 'Work With Us Band',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'body', label: 'Body', type: 'textarea', full: true },
      { name: 'buttonLabel', label: 'Button label', type: 'text' },
    ],
  },
  aboutBlocks: {
    label: 'About Blocks',
    fields: [
      { name: 'heading', label: 'Section heading', type: 'text' },
      {
        name: 'blocks',
        label: 'Blocks',
        type: 'objectList',
        itemLabel: 'Block',
        full: true,
        fields: [
          { name: 'tag', label: 'Tag', type: 'text' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'body', label: 'Body', type: 'textarea' },
        ],
      },
    ],
  },
  richText: {
    label: 'Rich Text',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'html', label: 'HTML content', type: 'richtext', full: true },
    ],
  },
  ctaMarquee: {
    label: 'CTA Marquee',
    fields: [
      { name: 'text', label: 'Text', type: 'text' },
      { name: 'href', label: 'Link', type: 'text' },
    ],
  },

  // ---- Index-page sections -------------------------------------------------
  pageHero: {
    label: 'Page Hero (compact)',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'title', label: 'Title (H1)', type: 'text', full: true },
      { name: 'subtitle', label: 'Subtitle', type: 'textarea', full: true },
      { name: 'dark', label: 'Dark background', type: 'boolean' },
      {
        name: 'ctas',
        label: 'Buttons',
        type: 'objectList',
        itemLabel: 'Button',
        full: true,
        fields: pageHeroCtaFields,
      },
    ],
    note: 'The compact hero used on Services, Portfolio, Team, Careers and Contact.',
  },
  servicesList: {
    label: 'Services — full grid',
    fields: [
      {
        name: 'background',
        label: 'Background',
        type: 'select',
        options: [
          { value: 'grey', label: 'Grey' },
          { value: 'white', label: 'White' },
        ],
      },
    ],
    note: 'Shows every published service. Manage the services themselves in the Services module.',
  },
  portfolioGallery: {
    label: 'Portfolio — filterable grid',
    fields: [
      {
        name: 'background',
        label: 'Background',
        type: 'select',
        options: [
          { value: 'white', label: 'White' },
          { value: 'grey', label: 'Grey' },
        ],
      },
    ],
    note: 'Shows every published case study with category filters.',
  },
  teamGrid: {
    label: 'Team — roster',
    fields: [
      {
        name: 'background',
        label: 'Background',
        type: 'select',
        options: [
          { value: 'white', label: 'White' },
          { value: 'grey', label: 'Grey' },
        ],
      },
    ],
    note: 'Shows every visible team member. Manage people in the Team module.',
  },
  jobsList: {
    label: 'Careers — open roles',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'jobCtaLabel', label: 'Role button label', type: 'text' },
      { name: 'emptyText', label: 'Text when no roles are open', type: 'textarea', full: true },
      { name: 'showApplicationForm', label: 'Show general application form', type: 'boolean' },
      { name: 'formEyebrow', label: 'Form eyebrow', type: 'text' },
      { name: 'formHeading', label: 'Form heading', type: 'text' },
      { name: 'formSubheading', label: 'Form subheading', type: 'textarea', full: true },
    ],
  },
  contactBlock: {
    label: 'Contact — forms, details & map',
    fields: [
      { name: 'infoHeading', label: 'Info panel heading', type: 'text' },
      { name: 'replyPromise', label: 'Reply promise line', type: 'text' },
      { name: 'whatsappLabel', label: 'WhatsApp button label', type: 'text' },
      { name: 'showMap', label: 'Show map', type: 'boolean' },
      {
        name: 'forms',
        label: 'Intake forms',
        type: 'objectList',
        itemLabel: 'Form',
        full: true,
        fields: [
          { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
          { name: 'heading', label: 'Heading', type: 'text' },
          { name: 'hint', label: 'Hint text', type: 'textarea' },
          { name: 'source', label: 'Source tag (shown on leads)', type: 'text' },
          { name: 'buttonLabel', label: 'Button label', type: 'text' },
          { name: 'rows', label: 'Message rows', type: 'number' },
        ],
      },
    ],
    note: 'Phone, email, WhatsApp, offices and socials all come from Site Settings.',
  },
  faq: {
    label: 'FAQ',
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'subheading', label: 'Subheading', type: 'textarea', full: true },
      {
        name: 'background',
        label: 'Background',
        type: 'select',
        options: [
          { value: 'white', label: 'White' },
          { value: 'grey', label: 'Grey' },
        ],
      },
      {
        name: 'items',
        label: 'Questions',
        type: 'objectList',
        itemLabel: 'Q&A',
        full: true,
        fields: [
          { name: 'question', label: 'Question', type: 'text' },
          { name: 'answer', label: 'Answer', type: 'textarea' },
        ],
      },
    ],
    note: 'Add the same questions under this page’s SEO → FAQ to emit FAQPage rich-result markup.',
  },
};

export const SECTION_TYPE_OPTIONS = Object.entries(SECTION_SCHEMAS).map(([value, s]) => ({
  value,
  label: s.label,
}));
