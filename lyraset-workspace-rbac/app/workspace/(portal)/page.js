import { requirePageUser } from "@/lib/workspace/auth";
import { can, P, ROLE_LABELS } from "@/lib/workspace/permissions";

export const metadata = { title: "Dashboard" };

export default async function WorkspaceDashboard({ searchParams }) {
  const user = await requirePageUser();
  const sp = (await searchParams) ?? {};

  return (
    <div className="ws-page">
      {sp.denied === "1" && (
        <div className="alert alert-warning ws-alert" role="alert">
          Your role doesn't have access to that page.
        </div>
      )}

      <h1 className="ws-page-title">Welcome, {user.name.split(" ")[0]}</h1>
      <p className="ws-page-lead">
        {ROLE_LABELS[user.role]}, {user.employeeId}
      </p>

      {can(user, P.ATTENDANCE_SELF) ? (
        <section className="ws-panel">
          <h2 className="ws-panel-title">Today</h2>
          <p className="ws-muted">The clock-in panel and EOD dialog will go here (Phase 1).</p>
        </section>
      ) : (
        <section className="ws-panel">
          <h2 className="ws-panel-title">Attendance</h2>
          <p className="ws-muted">You're exempt from clocking in and out.</p>
        </section>
      )}

      {can(user, P.LIVE_BOARD_VIEW) && (
        <section className="ws-panel">
          <h2 className="ws-panel-title">Who's in now</h2>
          <p className="ws-muted">The live attendance board will go here (Phase 1).</p>
        </section>
      )}

      <details className="ws-panel ws-perms">
        <summary>What your role can do ({user.permissions.length} permissions)</summary>
        <ul>
          {user.permissions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
