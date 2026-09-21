import { requirePageUser } from '@/lib/workspace/auth';
import { can, ROLE_LABELS } from '@/lib/workspace/permissions';
import { NAV_ITEMS } from '@/lib/workspace/navigation';
import PortalShell from '@/components/workspace/PortalShell';

export const dynamic = 'force-dynamic';

/**
 * The signed-in shell.
 *
 * The guard runs here as well as in middleware, because middleware only reads
 * the cookie: this check re-validates against the database, so a deactivated
 * account or a bumped tokenVersion is caught on the very next request.
 */
export default async function PortalLayout({ children }) {
  const user = await requirePageUser();

  // Filtered on the server: a link the role cannot use is never sent.
  const nav = NAV_ITEMS.filter((item) => !item.permission || can(user, item.permission)).map(
    ({ label, href, group }) => ({ label, href, group })
  );

  return (
    <PortalShell
      nav={nav}
      user={{ name: user.name, employeeId: user.employeeId }}
      roleLabel={ROLE_LABELS[user.role]}
    >
      {children}
    </PortalShell>
  );
}
