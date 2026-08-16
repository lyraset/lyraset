'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import Logo from '@/components/Logo';
import '@/styles/navbar.scss';

const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Services', href: '/services', dropdown: true },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'About', href: '/about' },
  { label: 'Careers', href: '/careers' },
  { label: 'Team', href: '/team' },
];

/**
 * Sticky site header: dark utility bar (collapses on scroll) + white navbar
 * with a Services mega-dropdown and a React-driven mobile offcanvas. No
 * Bootstrap JS — interactivity is local React state to keep the bundle light.
 */
export default function SiteHeader({ settings, services = [] }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  // Collapse the utility bar on scroll — with hysteresis. Collapsing removes the
  // bar's height (44px) from the document, which nudges scrollY; a single
  // threshold would let that nudge bounce the page back across the line and
  // flicker forever. Two thresholds with a gap wider than the bar's height make
  // that impossible: once collapsed, scrollY can't fall back under 24.
  useEffect(() => {
    let collapsed = window.scrollY > 90;
    setScrolled(collapsed);
    const onScroll = () => {
      const y = window.scrollY;
      if (!collapsed && y > 90) {
        collapsed = true;
        setScrolled(true);
      } else if (collapsed && y < 24) {
        collapsed = false;
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus on route change.
  useEffect(() => {
    setMenuOpen(false);
    setServicesOpen(false);
  }, [pathname]);

  // Lock scroll when the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const brand = settings?.brandName || 'LYRASET';
  const phone = settings?.phones?.[0];
  const email = settings?.emails?.[0];
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      {/* Utility bar */}
      <div className="utility-bar" aria-hidden={scrolled}>
        <div className="container-x utility-bar__inner">
          <div className="utility-bar__group">
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="utility-bar__link">
                <Icon name="phone" size={15} /> {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="utility-bar__link">
                <Icon name="mail" size={15} /> {email}
              </a>
            )}
          </div>
          <div className="utility-bar__group">
            {(settings?.socials || []).map((s) => (
              <a
                key={s.platform}
                href={s.url}
                className="utility-bar__social"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.platform}
              >
                <Icon name={s.platform} size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Navbar */}
      <div className="navbar-main">
        <div className="container-x navbar-main__inner">
          <Link href="/" className="brand" aria-label={`${brand} home`}>
            <Logo height={60} priority />
          </Link>

          <nav className="nav-links" aria-label="Primary">
            {NAV.map((item) =>
              item.dropdown ? (
                <div
                  key={item.href}
                  className="nav-item has-dropdown"
                  onMouseEnter={() => setServicesOpen(true)}
                  onMouseLeave={() => setServicesOpen(false)}
                >
                  <Link
                    href={item.href}
                    className={`nav-link ${isActive(item.href) ? 'is-active' : ''}`}
                    aria-expanded={servicesOpen}
                  >
                    {item.label} <Icon name="chevron-down" size={16} />
                  </Link>
                  <div className={`services-dropdown ${servicesOpen ? 'is-open' : ''}`}>
                    <div className="services-dropdown__grid">
                      {services.map((s) => (
                        <Link key={s.slug} href={`/services/${s.slug}`} className="services-dropdown__item">
                          <span className="services-dropdown__icon">
                            <Icon name={s.iconKey || 'sparkles'} size={18} />
                          </span>
                          <span>
                            <span className="services-dropdown__title">{s.title}</span>
                            <span className="services-dropdown__blurb">{s.shortBlurb}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isActive(item.href) ? 'is-active' : ''}`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          <div className="navbar-main__cta">
            <Link href="/contact" className="btn btn-primary btn-sm d-none d-lg-inline-flex">
              Contact <span className="btn-arrow"><Icon name="arrow-right" size={16} /></span>
            </Link>
            <button
              className="nav-toggle d-lg-none"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile offcanvas */}
      <div className={`offcanvas-menu ${menuOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true">
        <div className="offcanvas-menu__head">
          <Logo light height={34} />
          <button className="nav-toggle" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <Icon name="close" size={24} />
          </button>
        </div>
        <nav className="offcanvas-menu__nav" aria-label="Mobile">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="offcanvas-menu__link">
              {item.label}
            </Link>
          ))}
          <div className="offcanvas-menu__services">
            <span className="offcanvas-menu__label">Services</span>
            {services.map((s) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="offcanvas-menu__sublink">
                {s.title}
              </Link>
            ))}
          </div>
          <Link href="/contact" className="btn btn-primary w-100 mt-3">
            Contact Us <Icon name="arrow-right" size={16} />
          </Link>
        </nav>
      </div>
      {menuOpen && <div className="offcanvas-backdrop" onClick={() => setMenuOpen(false)} />}
    </header>
  );
}
