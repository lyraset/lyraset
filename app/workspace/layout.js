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

export default function WorkspaceRootLayout({ children }) {
  return <div className="ws-root">{children}</div>;
}
