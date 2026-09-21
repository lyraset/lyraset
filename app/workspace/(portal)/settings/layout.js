import Link from 'next/link';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { SETTINGS_NAV } from './nav';

export const dynamic = 'force-dynamic';

/**
 * Settings are Owner-only. The guard runs here so every page below inherits
 * it, rather than each one remembering — but each page still calls its own
 * guard too, because a layout is not an access control boundary in Next.
 */
export default async function SettingsLayout({ children }) {
  await requirePagePermission(P.SETTINGS_MANAGE);

  return (
    <>
      <nav
        className="ws-nav mb-3"
        aria-label="Settings"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '0.35rem' }}
      >
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="ws-nav-link"
            style={{ border: '1px solid var(--ws-line)' }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
