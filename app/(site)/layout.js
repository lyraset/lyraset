import SiteHeader from '@/components/layout/SiteHeader';
import Footer from '@/components/layout/Footer';
import FloatingWhatsApp from '@/components/layout/FloatingWhatsApp';
import AnnouncementPopup from '@/components/AnnouncementPopup';
import RouteProgress from '@/components/motion/RouteProgress';
import Analytics from '@/components/Analytics';
import { SiteJsonLd } from '@/components/JsonLd';
import { getSettings, getServices } from '@/lib/data';

/**
 * Public site chrome (route group — no URL segment). Fetches Site Settings +
 * services once and shares them with the header, footer, and WhatsApp button.
 *
 * SiteJsonLd renders the Organization + WebSite nodes here so every public page
 * carries them; pages add their own WebPage/breadcrumb graph on top.
 */
export default async function SiteLayout({ children }) {
  const [settings, services] = await Promise.all([getSettings(), getServices()]);

  return (
    <>
      <SiteJsonLd />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <RouteProgress />
      <SiteHeader settings={settings} services={services} />
      <main id="main">{children}</main>
      <Footer settings={settings} services={services} />
      <FloatingWhatsApp number={settings?.whatsapp} template={settings?.whatsappTemplate} />
      <AnnouncementPopup announcement={settings?.announcement} />
      <Analytics ga4Id={settings?.ga4Id} metaPixelId={settings?.metaPixelId} />
    </>
  );
}
