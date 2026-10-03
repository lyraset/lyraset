import '@/styles/workspace/base.css';
import '@/styles/workspace/layout.css';
import '@/styles/workspace/components.css';

/**
 * The workspace root layout.
 *
 * This is the only place the portal stylesheets are imported, so none of them
 * reach a public page bundle. The area is marked noindex here as well as in
 * middleware, because a header alone does not cover a page served from cache.
 */
export const metadata = {
  title: { default: 'Workspace', template: '%s | LYRASET Workspace' },
  robots: { index: false, follow: false, nocache: true },
  // Installable on a phone, which is how most people will clock in.
  manifest: '/workspace/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Workspace',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  themeColor: '#070e21',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Picks the theme before the first paint: the viewer's saved choice, or what
 * their system asks for. It runs inline, ahead of React, so nobody sees a dark
 * page flash white (or the other way round) while the app loads. The key is
 * shared with components/workspace/ThemeToggle.js.
 *
 * The flag goes on <body>, which the root layout already marks
 * suppressHydrationWarning: React owns that element, and an attribute that
 * appeared before it hydrated would otherwise be reported as a mismatch.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('lyraset.workspace.theme');var light=s==='light'||(s!=='dark'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);document.body.setAttribute('data-ws-theme',light?'light':'dark');}catch(e){}})();`;

export default function WorkspaceRootLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <div className="ws-root">{children}</div>
    </>
  );
}
