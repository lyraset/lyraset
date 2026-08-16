import { getSettings, getSeoDefault } from '@/lib/data';
import {
  graph,
  organizationSchema,
  websiteSchema,
  webPageSchema,
  breadcrumbSchema,
  faqSchema,
} from '@/lib/schema';

/**
 * JSON-LD rendering.
 *
 * Two components cover the whole site:
 *   <SiteJsonLd/>  once in the site layout — Organization + WebSite
 *   <PageJsonLd/>  once per page — WebPage + breadcrumbs + FAQ + entity nodes
 *
 * Both emit a single @graph script so the @id cross-references resolve.
 */

/**
 * Serialise a JSON-LD graph into a script tag.
 * `<` is escaped so a stray "</script>" inside CMS copy can't break out of the
 * tag — the standard injection vector for JSON embedded in HTML.
 */
function Ld({ data }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/**
 * Site-wide graph: the Organization (or LocalBusiness) and WebSite nodes every
 * page's markup points at. Render once, in the site layout.
 */
export async function SiteJsonLd() {
  const [settings, seo] = await Promise.all([getSettings(), getSeoDefault()]);
  const nodes = [];
  if (seo?.structuredData?.organization !== false) nodes.push(organizationSchema({ settings, seo }));
  if (seo?.structuredData?.website !== false) nodes.push(websiteSchema({ settings, seo }));
  return <Ld data={graph(nodes)} />;
}

/**
 * Per-page graph.
 *
 * @param {object} props
 * @param {string} props.path - page path, e.g. "/services/seo"
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {string} [props.type] - WebPage subtype (AboutPage, ContactPage, …)
 * @param {string} [props.image]
 * @param {string|Date} [props.updatedAt]
 * @param {Array<{name: string, path: string}>} [props.breadcrumb] - trail after Home
 * @param {Array<{question: string, answer: string}>} [props.faq]
 * @param {Array<object>} [props.nodes] - extra schema nodes (Service, JobPosting…)
 */
export async function PageJsonLd({
  path = '/',
  title,
  description,
  type = 'WebPage',
  image,
  updatedAt,
  breadcrumb = [],
  faq = [],
  nodes = [],
}) {
  const seo = await getSeoDefault();
  const showBreadcrumbs = seo?.structuredData?.breadcrumbs !== false && breadcrumb.length > 0;

  return (
    <Ld
      data={graph([
        webPageSchema({ path, title, description, type, image, updatedAt }),
        showBreadcrumbs ? breadcrumbSchema(breadcrumb) : undefined,
        faqSchema(faq),
        ...nodes,
      ])}
    />
  );
}

/**
 * Kept for backwards compatibility with any page still importing it — the
 * Organization node now lives in <SiteJsonLd/> at the layout level.
 * @deprecated use SiteJsonLd
 */
export async function OrganizationJsonLd() {
  return <SiteJsonLd />;
}
