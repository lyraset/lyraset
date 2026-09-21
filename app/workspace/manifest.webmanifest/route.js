/**
 * The workspace PWA manifest.
 *
 * Served from a route rather than dropped in /public so it can carry the
 * no-store and noindex headers the rest of the area uses — an installable app
 * manifest for an internal portal has no business being cached publicly or
 * turning up in a search result.
 *
 * `start_url` is the dashboard: someone who installs this to their phone taps
 * the icon to clock in, and should land on the clock, not on a marketing page.
 */
export const dynamic = 'force-static';

const MANIFEST = {
  name: 'LYRASET Workspace',
  short_name: 'Workspace',
  description: 'Clock in, submit your EOD and manage leave.',
  id: '/workspace',
  start_url: '/workspace',
  scope: '/workspace',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#070e21',
  theme_color: '#070e21',
  lang: 'en',
  dir: 'ltr',
  categories: ['business', 'productivity'],
  icons: [
    {
      src: '/ws-icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/ws-icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    // The same art declared maskable: it is padded into the safe zone, so a
    // launcher can crop it to a circle or a squircle without clipping the mark.
    {
      src: '/ws-icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
  shortcuts: [
    { name: 'Clock in or out', short_name: 'Clock', url: '/workspace' },
    { name: 'My EODs', short_name: 'EODs', url: '/workspace/eod' },
    { name: 'Leave', short_name: 'Leave', url: '/workspace/leave' },
  ],
};

export function GET() {
  return new Response(JSON.stringify(MANIFEST, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
