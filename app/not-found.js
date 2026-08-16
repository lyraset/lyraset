import Link from 'next/link';
import NotFoundPath from '@/components/NotFoundPath';
import '@/styles/not-found.scss';

export const metadata = {
  title: 'Page not found',
  // A 404 should never be indexed, whatever the site-wide default says.
  robots: { index: false, follow: true },
};

/** Where a lost visitor most likely meant to go. */
const SUGGESTIONS = [
  { label: 'Services', href: '/services' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'About', href: '/about' },
  { label: 'Careers', href: '/careers' },
  { label: 'Contact', href: '/contact' },
];

export default function NotFound() {
  return (
    <main className="nf">
      {/* Decorative layers — all aria-hidden so screen readers get only the copy. */}
      <div className="nf__stars nf__stars--sm" aria-hidden="true" />
      <div className="nf__stars nf__stars--md" aria-hidden="true" />
      <div className="nf__glow" aria-hidden="true" />
      <div className="nf__numeral" aria-hidden="true">
        404
      </div>

      <div className="nf__inner">
        <span className="nf__eyebrow">
          <span className="nf__dot" aria-hidden="true" />
          Error 404
        </span>

        <h1 className="nf__title">
          This page went <em>off the map</em>.
        </h1>

        <p className="nf__text">
          The link may be broken, or the page may have moved. Nothing&apos;s lost — pick a
          destination below and we&apos;ll get you back on course.
        </p>

        <NotFoundPath />

        <div className="nf__actions">
          <Link href="/" className="nf__btn nf__btn--primary">
            Back to Home
          </Link>
          <Link href="/contact" className="nf__btn nf__btn--ghost">
            Talk to Us
          </Link>
        </div>

        <nav className="nf__links" aria-label="Suggested pages">
          <p className="nf__links-label">Popular pages</p>
          <div className="nf__links-row">
            {SUGGESTIONS.map((s) => (
              <Link key={s.href} href={s.href} className="nf__chip">
                {s.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
