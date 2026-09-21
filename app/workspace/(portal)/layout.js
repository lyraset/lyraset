import Link from "next/link";
import { requirePageUser } from "@/lib/workspace/auth";
import { can, ROLE_LABELS } from "@/lib/workspace/permissions";
import { NAV_ITEMS } from "@/lib/workspace/navigation";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }) {
  const user = await requirePageUser();
  const nav = NAV_ITEMS.filter((item) => !item.permission || can(user, item.permission));

  return (
    <div className="ws-shell">
      <aside className="ws-sidebar">
        <p className="ws-brand-mark">LYRASET Workspace</p>
        <nav className="ws-nav" aria-label="Workspace">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="ws-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ws-user">
          <p className="ws-user-name">{user.name}</p>
          <p className="ws-user-role">{ROLE_LABELS[user.role]}</p>
          <form action="/api/workspace/auth/logout" method="post">
            <button type="submit" className="btn ws-btn-ghost w-100">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="ws-main">{children}</main>
    </div>
  );
}
