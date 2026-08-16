/**
 * Canonical site URL resolution.
 *
 * Every absolute URL the site emits — canonicals, OG tags, JSON-LD `@id`s,
 * sitemap entries, robots.txt — flows through here, so there is exactly one
 * place that decides "what domain are we?".
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL       explicit override, wins everywhere
 *   2. Vercel *preview* deploys   the per-deploy URL, so previews self-link
 *      instead of pointing at production (and are noindexed — see isIndexable)
 *   3. production                 the canonical domain, CANONICAL_SITE_URL
 *   4. anything else              localhost for local dev
 *
 * Note the deliberate ordering of 2 and 3: a preview deploy must NOT claim
 * lyraset.com as its canonical, or Google sees duplicate sites competing for
 * the same URLs.
 */

/** The production domain. Change this one line to move the site. */
export const CANONICAL_SITE_URL = 'https://lyraset.com';

const stripTrailingSlash = (url) => url.replace(/\/+$/, '');

/**
 * Resolve the origin for the current environment, without a trailing slash.
 * @returns {string} e.g. "https://lyraset.com"
 */
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  // Preview/branch deploys link to themselves.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return CANONICAL_SITE_URL;
  }

  return 'http://localhost:3000';
}

/**
 * Join a path onto the site origin.
 * @param {string} [path] - e.g. "/services/seo"; "/" and "" both yield the bare origin
 * @returns {string} absolute URL
 */
export function absoluteUrl(path = '/') {
  const base = getSiteUrl();
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Whether search engines should index this deployment at all. Preview builds
 * are excluded so staging copy never competes with production in the index.
 * @returns {boolean}
 */
export function isIndexable() {
  if (process.env.VERCEL_ENV === 'preview') return false;
  return getSiteUrl() === CANONICAL_SITE_URL || Boolean(process.env.NEXT_PUBLIC_SITE_URL);
}
