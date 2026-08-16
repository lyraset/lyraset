/**
 * Seed: composable pages. Each page is an ordered list of section records with
 * a `type` and a flexible `data` payload. The public renderer maps each type to
 * a component; the admin edits any field, toggles visibility, and reorders —
 * all without code changes.
 */

const processSteps = [
  {
    level: 'LVL 01',
    title: 'Discovery Call',
    body: 'We start with a deep-dive into your brand, goals, target audience, and current digital presence. No templates — just honest analysis.',
  },
  {
    level: 'LVL 02',
    title: 'Strategy Blueprint',
    body: 'We craft a custom 90-day growth roadmap covering content pillars, ad budgets, platform priorities, and KPIs tailored to your business.',
  },
  {
    level: 'LVL 03',
    title: 'Creative Production',
    body: 'Our design and video team produces scroll-stopping content — reels, graphics, ad creatives — all aligned to your brand identity.',
  },
  {
    level: 'LVL 04',
    title: 'Launch & Distribute',
    body: 'We deploy your campaigns across the right channels at the right times, managing every post, ad set, and audience segment hands-on.',
  },
  {
    level: 'LVL 05',
    title: 'Analyse & Scale',
    body: "We track every metric that matters, kill what doesn't work, double down on what does, and report back with full transparency monthly.",
  },
];

const aboutBlocks = [
  {
    tag: 'Our Story',
    title: 'BUILT IN A BASEMENT, BACKED BY DATA',
    body: 'LYRASET started in 2022 with one promise: every campaign we run has to move a real number — revenue, leads, or sales. Three years later, that promise is still the only brief we accept. We grew from a two-person studio into a 12-person team because our clients stopped needing anyone else.',
  },
  {
    tag: 'Mission',
    title: 'WHERE STRATEGY MEETS CREATIVITY',
    body: 'Most agencies pick a side. We never did. Strategy without creative is a spreadsheet. Creative without strategy is a mood board. We bring both to every brief — and we make them argue productively until the work is sharper than the brief itself.',
  },
  {
    tag: 'Values',
    title: 'OWN THE OUTCOME, NOT THE OUTPUT',
    body: "We don't measure success in deliverables. We measure it in the metric the client actually cares about. Every retainer starts with one question — what does winning look like for you? — and ends only when that number moves. No fluff. No vanity dashboards.",
  },
  {
    tag: 'Process',
    title: 'TRANSPARENCY BY DEFAULT',
    body: "Our dashboards, our briefs, our numbers — all yours, all the time. We send weekly Loom recaps, monthly performance reviews, and quarterly strategy resets. You should never have to ask what we're working on. If we slipped, you'll know before the next standup.",
  },
  {
    tag: 'Culture',
    title: 'SMALL TEAM, BIG SENIORITY',
    body: "Every strategist on your account has 5+ years in the trenches. We don't pad teams with juniors. The person in your kickoff call is the person shipping the work. No bait-and-switch, no learning on your dime.",
  },
  {
    tag: "What's Next",
    title: 'AI IS A TOOL, NOT A STRATEGY',
    body: "We use AI every day — for research, for draft copy, for creative iterations. But we don't sell AI as a differentiator. Your customers don't care how we worked, only that the work landed. We use the best tools, and we never hide behind them.",
  },
];

export const pages = [
  {
    slug: 'home',
    title: 'Home',
    published: true,
    seo: {
      title: 'LYRASET — International Marketing Agency',
      description:
        'Global reach, measurable growth. Data-driven marketing — paid ads, social, video, SEO, and web — engineered by LYRASET.',
    },
    sections: [
      {
        type: 'hero',
        label: 'Home Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'International Marketing Agency',
          headlineLines: ['GLOBAL REACH,', 'MEASURABLE', 'GROWTH.'],
          subline:
            'Unlock your full potential with data-driven marketing — paid ads, social, video, SEO, and web — engineered by LYRASET.',
          primaryCta: { label: 'Start Your Growth', href: '/contact', style: 'primary' },
          secondaryCta: { label: 'Our Case Studies', href: '/portfolio', style: 'ghost' },
          image: {},
          showStrip: true,
        },
      },
      { type: 'statsBar', label: 'Stats Bar', visible: true, order: 1, data: {} },
      { type: 'platformMarquee', label: 'Platform Ticker', visible: true, order: 2, data: {} },
      {
        type: 'servicesGrid',
        label: 'Services Preview',
        visible: true,
        order: 3,
        data: {
          eyebrow: 'What We Offer',
          heading: 'Services engineered for growth',
          subheading:
            '360° digital marketing — social media, paid ads, video production, design, growth strategy, and web development.',
          limit: 6,
        },
      },
      {
        type: 'portfolioPreview',
        label: 'Portfolio Preview',
        visible: true,
        order: 4,
        data: {
          eyebrow: 'Creative Work',
          heading: 'Some of our measurable growth stories',
          subheading:
            "Campaigns, visuals, and digital experiences we've crafted for brands that mean business.",
          limit: 6,
        },
      },
      {
        type: 'processTimeline',
        label: 'Process Timeline',
        visible: true,
        order: 5,
        data: {
          eyebrow: 'Quest Sequence',
          heading: 'How we drive results',
          steps: processSteps,
        },
      },
      {
        type: 'testimonialSlider',
        label: 'Testimonials',
        visible: true,
        order: 6,
        data: { eyebrow: 'What Clients Say', heading: 'Brands that grew with us' },
      },
      {
        type: 'missionColumns',
        label: 'Mission Columns',
        visible: true,
        order: 7,
        data: {
          eyebrow: 'Mission Checklist',
          heading: 'Strategy meets creativity',
          columns: [
            {
              title: 'Own the outcome',
              body: 'We measure success in the metric you actually care about — not deliverables.',
            },
            {
              title: 'Transparency by default',
              body: 'Weekly recaps, monthly reviews, quarterly resets. You always know what we’re working on.',
            },
            {
              title: 'Small team, big seniority',
              body: 'Every strategist on your account has 5+ years in the trenches. No juniors, no bait-and-switch.',
            },
          ],
        },
      },
      {
        type: 'workWithUsForm',
        label: 'Work With Us Band',
        visible: true,
        order: 8,
        data: {
          heading: 'Ready to grow your brand?',
          body: "Tell us about your goals and we'll build something that works for you.",
          buttonLabel: 'Start With Us',
        },
      },
      {
        type: 'ctaMarquee',
        label: "Let's Talk Marquee",
        visible: true,
        order: 9,
        data: { text: "Let's Talk", href: '/contact' },
      },
    ],
  },

  {
    slug: 'about',
    title: 'About',
    published: true,
    seo: {
      title: 'About LYRASET',
      description:
        'A marketing agency that thinks like founders. Built in a basement, backed by data — where strategy meets creativity.',
    },
    sections: [
      {
        type: 'hero',
        label: 'About Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'About Us',
          headlineLines: ["WE'RE A MARKETING AGENCY", 'THAT THINKS LIKE', 'FOUNDERS'],
          subline:
            'Our mission, vision, and the story behind LYRASET — where strategy meets creativity.',
          primaryCta: { label: 'Work With Us', href: '/contact', style: 'primary' },
          secondaryCta: { label: 'Meet the Team', href: '/team', style: 'ghost' },
          image: {},
          showStrip: false,
        },
      },
      {
        type: 'aboutBlocks',
        label: 'About Blocks',
        visible: true,
        order: 1,
        data: { blocks: aboutBlocks },
      },
      {
        type: 'processTimeline',
        label: 'Process Timeline',
        visible: true,
        order: 2,
        data: { eyebrow: 'Our Process', heading: 'The quest sequence', steps: processSteps },
      },
      {
        type: 'workWithUsForm',
        label: 'Work With Us Band',
        visible: true,
        order: 3,
        data: {
          heading: 'Let’s build something that moves a number',
          body: 'Every retainer starts with one question — what does winning look like for you?',
          buttonLabel: 'Start With Us',
        },
      },
    ],
  },

  {
    slug: 'start',
    title: "Glad You're Here",
    published: true,
    seo: {
      title: 'Welcome to LYRASET',
      description:
        'The short version of who we are, what we do, and how to reach us. We respond within one business day.',
    },
    sections: [
      {
        type: 'hero',
        label: 'Start Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'Welcome to LYRASET',
          headlineLines: ["GLAD", "YOU'RE", 'HERE.'],
          subline:
            'You just took the first step toward marketing that actually moves a number. Below is the short version of who we are, what we do, and how to reach us. We respond to every message within one business day — promise.',
          primaryCta: { label: 'Message Us on WhatsApp', href: '#contact', style: 'primary' },
          secondaryCta: { label: 'Send a Detailed Brief', href: '/contact', style: 'ghost' },
          image: {},
          showStrip: false,
        },
      },
      {
        type: 'aboutBlocks',
        label: 'What We Do',
        visible: true,
        order: 1,
        data: {
          blocks: [
            {
              tag: 'What We Do',
              title: 'WE BUILD BRANDS THAT ACTUALLY GROW',
              body: 'LYRASET is a Pakistan-born, globally-minded digital marketing studio. We work with founders, marketing leads, and growth-stage teams who care about real numbers — not just deliverables. We bring strategy and creative to every brief, make them argue productively until the work is sharper than the brief itself, then ship it, measure it, and iterate.',
            },
          ],
        },
      },
      { type: 'statsBar', label: 'Stats Bar', visible: true, order: 2, data: {} },
      {
        type: 'servicesGrid',
        label: 'Services',
        visible: true,
        order: 3,
        data: {
          eyebrow: 'Our Services',
          heading: 'What we can do for you',
          subheading: 'See all services in detail on the services page.',
          limit: 6,
        },
      },
      {
        type: 'workWithUsForm',
        label: 'Contact CTA',
        visible: true,
        order: 4,
        data: {
          heading: "Let's start a conversation",
          body: "Tell us about your brand and your goals. We'll get back within one business day — no fluff, no spam, no hard sell.",
          buttonLabel: 'Send Message',
        },
      },
    ],
  },

  {
    slug: 'privacy',
    title: 'Privacy Policy',
    published: true,
    seo: { title: 'Privacy Policy', description: 'How LYRASET handles your data.' },
    sections: [
      {
        type: 'richText',
        label: 'Privacy Body',
        visible: true,
        order: 0,
        data: {
          heading: 'Privacy Policy',
          html: '<p>We respect your privacy. We never share your details with third parties. Information you submit through our forms is used only to respond to your enquiry and manage our relationship with you.</p><p>You can request access to, correction of, or deletion of your data at any time by emailing us. This is placeholder content — edit it in the admin CMS to reflect your final policy.</p>',
        },
      },
    ],
  },

  {
    slug: 'terms',
    title: 'Terms of Service',
    published: true,
    seo: { title: 'Terms of Service', description: 'The terms governing use of the LYRASET site.' },
    sections: [
      {
        type: 'richText',
        label: 'Terms Body',
        visible: true,
        order: 0,
        data: {
          heading: 'Terms of Service',
          html: '<p>By using this website you agree to these terms. Content on this site is provided for general information and may change without notice.</p><p>This is placeholder content — edit it in the admin CMS to reflect your final terms.</p>',
        },
      },
    ],
  },

  // ---- Index pages ---------------------------------------------------------
  // These five used to be hard-coded React. Their copy now lives here as the
  // starting point, and in the CMS after `npm run sync-pages`. The layout is
  // identical to what the components rendered before.
  {
    slug: 'services',
    title: 'Services',
    published: true,
    seo: {
      title: 'Services',
      description:
        '360° digital marketing — paid ads, social, SEO, video, brand, data, lifecycle, and growth strategy.',
      schemaType: 'CollectionPage',
    },
    sections: [
      {
        type: 'pageHero',
        label: 'Services Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'What We Offer',
          title: 'Services engineered for growth',
          subtitle:
            '360° digital marketing — social media, paid ads, video production, design, growth strategy, and web development. Pick a service to see how we run it.',
          dark: true,
          ctas: [{ label: 'Start Your Growth', href: '/contact', style: 'primary' }],
        },
      },
      {
        type: 'servicesList',
        label: 'All Services',
        visible: true,
        order: 1,
        data: { background: 'grey' },
      },
    ],
  },

  {
    slug: 'portfolio',
    title: 'Portfolio',
    published: true,
    seo: {
      title: 'Portfolio',
      description:
        "A curated showcase of campaigns, visuals, and digital experiences we've crafted for brands that mean business.",
      schemaType: 'CollectionPage',
    },
    sections: [
      {
        type: 'pageHero',
        label: 'Portfolio Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'Creative Work',
          title: 'Measurable growth stories',
          subtitle:
            "A curated showcase of campaigns, visuals, and digital experiences we've crafted for brands that mean business.",
          dark: true,
          ctas: [],
        },
      },
      {
        type: 'portfolioGallery',
        label: 'Case Study Grid',
        visible: true,
        order: 1,
        data: { background: 'white' },
      },
    ],
  },

  {
    slug: 'team',
    title: 'Team',
    published: true,
    seo: {
      title: 'Team',
      description:
        'Meet the creative minds and growth strategists driving real results for brands.',
      schemaType: 'AboutPage',
    },
    sections: [
      {
        type: 'pageHero',
        label: 'Team Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'Meet the Wizards',
          title: 'The team that actually does the work',
          subtitle:
            'Small team, big seniority. Every strategist on your account has 5+ years in the trenches — the person in your kickoff call is the person shipping the work.',
          dark: true,
          ctas: [],
        },
      },
      {
        type: 'teamGrid',
        label: 'Team Roster',
        visible: true,
        order: 1,
        data: { background: 'white' },
      },
    ],
  },

  {
    slug: 'careers',
    title: 'Careers',
    published: true,
    seo: {
      title: 'Careers',
      description:
        "We're always looking for talented people passionate about digital marketing, creativity, and delivering real results.",
      schemaType: 'CollectionPage',
    },
    sections: [
      {
        type: 'pageHero',
        label: 'Careers Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'Join the Team',
          title: 'Careers at LYRASET',
          subtitle:
            "We're always looking for talented people who are passionate about digital marketing, creativity, and delivering real results.",
          dark: true,
          ctas: [],
        },
      },
      {
        type: 'jobsList',
        label: 'Open Roles & Apply',
        visible: true,
        order: 1,
        data: {
          eyebrow: 'Hiring Now',
          heading: 'Open roles',
          jobCtaLabel: 'View & Apply',
          emptyText: 'No open roles right now — check back soon.',
          showApplicationForm: true,
          formEyebrow: 'Apply',
          formHeading: 'Send us your resume',
          formSubheading:
            "Tell us about yourself, what role(s) you're interested in, and paste a link to your portfolio or LinkedIn. We'll get back to you within five business days.",
        },
      },
    ],
  },

  {
    slug: 'contact',
    title: 'Contact',
    published: true,
    seo: {
      title: 'Contact',
      description:
        'Ready to grow your brand? Drop us a message on WhatsApp, send a quick brief, or email us directly. We respond fast, no fluff.',
      schemaType: 'ContactPage',
    },
    sections: [
      {
        type: 'pageHero',
        label: 'Contact Hero',
        visible: true,
        order: 0,
        data: {
          eyebrow: 'Get In Touch',
          title: 'Ready to grow your brand?',
          subtitle:
            'Drop us a message on WhatsApp, send a quick brief below, or email us directly. We respond fast, no fluff.',
          dark: true,
          ctas: [
            {
              label: 'Message Us on WhatsApp',
              href: '{whatsapp}',
              style: 'whatsapp',
              icon: 'whatsapp',
            },
            { label: 'Send an Email', href: '{email}', style: 'ghost', icon: 'mail' },
          ],
        },
      },
      {
        type: 'contactBlock',
        label: 'Forms, Details & Map',
        visible: true,
        order: 1,
        data: {
          infoHeading: 'Contact Info',
          replyPromise: 'We reply within one business day',
          whatsappLabel: 'Message us on WhatsApp',
          showMap: true,
          forms: [
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
          ],
        },
      },
    ],
  },
];

export default pages;
