import { displayFont, bodyFont } from './fonts';
import { getSiteUrl } from '@/lib/site';
import { getSeoDefault } from '@/lib/data';
import '@/styles/globals.scss';
import '@/styles/animations.scss';

/**
 * Root metadata, read from the CMS SEO defaults so the title template, default
 * description and search-console verification codes are all editable in the
 * admin. Individual pages override title/description via buildMetadata.
 */
export async function generateMetadata() {
  const seo = await getSeoDefault();

  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: seo?.defaultTitle || 'LYRASET — International Marketing Agency',
      template: seo?.titleTemplate || '%s · LYRASET',
    },
    description:
      seo?.defaultDescription ||
      'Where strategy meets creativity to drive growth, engagement, and real business results.',
    applicationName: seo?.organization?.name || 'LYRASET',
    verification: {
      google: seo?.verification?.google || undefined,
      other: {
        ...(seo?.verification?.bing ? { 'msvalidate.01': seo.verification.bing } : {}),
        ...(seo?.verification?.pinterest ? { 'p:domain_verify': seo.verification.pinterest } : {}),
      },
    },
  };
}

export const viewport = {
  themeColor: '#0A1628',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla adds
          cz-shortcut-listen) inject attributes on <body> before hydration,
          which would otherwise trip a harmless hydration mismatch warning. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
