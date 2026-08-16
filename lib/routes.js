import 'server-only';
import path from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

/**
 * Route inventory for sitemap.xml and robots.txt.
 *
 * A URL reaches the sitemap through one of three channels, and all three are
 * automatic — adding a page should never require editing the sitemap:
 *
 *   1. CMS pages       every published Page document (admin → Pages → New page)
 *   2. Collections     services, case studies, jobs — one URL per published item
 *   3. Code routes     any app/(site)/<segment>/page.js on disk, discovered by
 *                      scanning the source tree, with STATIC_ROUTES as a fallback
 *                      for runtime environments where the tree isn't readable
 *
 * Channel 3 is the safety net: a hand-built route with no Page document still
 * gets indexed. Channels 1 and 2 are the normal path.
 */

/** Never indexed, never in the sitemap, always disallowed in robots.txt. */
export const PRIVATE_PREFIXES = ['/admin', '/api'];

/**
 * Per-route sitemap hints. Anything not listed falls back to DEFAULT_HINT, so
 * this map is an optimisation, not a registration step — an unlisted route is
 * still included.
 */
export const ROUTE_HINTS = {
  '/': { priority: 1.0, changeFrequency: 'weekly' },
  '/services': { priority: 0.9, changeFrequency: 'weekly' },
  '/portfolio': { priority: 0.8, changeFrequency: 'weekly' },
  '/about': { priority: 0.7, changeFrequency: 'monthly' },
  '/contact': { priority: 0.7, changeFrequency: 'monthly' },
  '/careers': { priority: 0.7, changeFrequency: 'weekly' },
  '/team': { priority: 0.6, changeFrequency: 'monthly' },
  '/start': { priority: 0.5, changeFrequency: 'monthly' },
  '/privacy': { priority: 0.3, changeFrequency: 'yearly' },
  '/terms': { priority: 0.3, changeFrequency: 'yearly' },
};

export const DEFAULT_HINT = { priority: 0.5, changeFrequency: 'monthly' };

/** Hints for the dynamic collection families. */
export const COLLECTION_HINTS = {
  '/services': { priority: 0.8, changeFrequency: 'monthly' },
  '/portfolio': { priority: 0.6, changeFrequency: 'monthly' },
  '/careers': { priority: 0.6, changeFrequency: 'weekly' },
};

/**
 * Fallback list of file-based routes, used when the source tree can't be read
 * (some serverless runtimes). Keep in sync only if you add a page that has no
 * Page document — the discovery pass below covers the normal case.
 */
export const STATIC_ROUTES = [
  '/',
  '/about',
  '/services',
  '/portfolio',
  '/team',
  '/careers',
  '/contact',
  '/start',
  '/privacy',
  '/terms',
];

/**
 * Scan app/(site) for file-based routes.
 *
 * Skips route groups "(site)", dynamic segments "[slug]" (those are enumerated
 * from their collections instead), and private/utility files. Returns null when
 * the tree isn't readable so callers can fall back to STATIC_ROUTES.
 *
 * @returns {string[]|null} paths like ["/", "/about", "/services"]
 */
export function discoverCodeRoutes() {
  const root = path.join(process.cwd(), 'app', '(site)');
  if (!existsSync(root)) return null;

  const found = [];

  const walk = (dir, segments) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((e) => e.isFile() && /^page\.(js|jsx|ts|tsx)$/.test(e.name))) {
      found.push(`/${segments.join('/')}`.replace(/\/+$/, '') || '/');
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Dynamic segments come from their collections; @slots and _private are
      // not routable; route groups add a directory level but no URL segment.
      if (name.startsWith('[') || name.startsWith('@') || name.startsWith('_')) continue;
      const isGroup = name.startsWith('(') && name.endsWith(')');
      walk(path.join(dir, name), isGroup ? segments : [...segments, name]);
    }
  };

  try {
    walk(root, []);
  } catch {
    return null;
  }

  return found.length > 0 ? [...new Set(found)] : null;
}

/**
 * Every file-based route, discovered if possible and hard-coded otherwise.
 * @returns {string[]}
 */
export function getCodeRoutes() {
  return discoverCodeRoutes() || STATIC_ROUTES;
}

/**
 * Map a Page document slug to its public path. The home page is stored under
 * the slug "home" but lives at "/".
 * @param {string} slug
 * @returns {string}
 */
export function pathForPageSlug(slug) {
  if (!slug || slug === 'home' || slug === 'index') return '/';
  return `/${slug.replace(/^\/+/, '')}`;
}

/**
 * Sitemap hints for a path, preferring an explicit CMS override.
 * @param {string} routePath
 * @param {{priority?: number, changeFrequency?: string}} [override]
 */
export function hintsFor(routePath, override = {}) {
  const base = ROUTE_HINTS[routePath] || DEFAULT_HINT;
  return {
    priority: typeof override.priority === 'number' ? override.priority : base.priority,
    changeFrequency: override.changeFrequency || base.changeFrequency,
  };
}
