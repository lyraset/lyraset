import Link from 'next/link';
import { requirePageUser } from '@/lib/workspace/auth';
import { can, P, ROLE_LABELS } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Project from '@/models/workspace/Project';
import { getWorkspaceContext, cycleFor, officeFor } from '@/lib/workspace/context';
import { getTodayState, buildDayRange } from '@/lib/workspace/services/attendance';
import { getBalanceSummary } from '@/lib/workspace/services/leave';
import { buildTeamDay } from '@/lib/workspace/services/team';
import { pendingApprovals } from '@/lib/workspace/services/requests';
import { formatDuration, lateDeductionDays } from '@/lib/workspace/calc/attendance';
import { formatDays } from '@/lib/workspace/calc/leave';
import ClockPanel from '@/components/workspace/ClockPanel';
import LiveBoard from '@/components/workspace/LiveBoard';
import ConsentNotice from '@/components/workspace/ConsentNotice';
import { Panel, Stat, Empty } from '@/components/workspace/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

/**
 * The dashboard, which is a different page for each role without being four
 * pages: self-service for anyone who clocks in, oversight for anyone who can
 * see the team, and both for the Owner.
 */
export default async function WorkspaceDashboard({ searchParams }) {
  const user = await requirePageUser();
  const sp = (await searchParams) ?? {};

  const ctx = await getWorkspaceContext();
  const clocksIn = can(user, P.ATTENDANCE_SELF);

  const [todayState, projects, balance, cycleStats, live, approvals] = await Promise.all([
    clocksIn ? getTodayState({ user }) : null,
    clocksIn ? loadProjects() : [],
    can(user, P.LEAVE_REQUEST) ? getBalanceSummary({ user }).catch(() => null) : null,
    clocksIn ? loadCycleStats(ctx, user) : null,
    can(user, P.LIVE_BOARD_VIEW) ? buildTeamDay({ live: true }) : null,
    can(user, P.APPROVALS_MANAGE) ? pendingApprovals({ approver: user }) : null,
  ]);

  const needsConsent = clocksIn && !user.consentAcknowledgedAt;

  return (
    <div className="ws-page">
      {sp.denied === '1' && (
        <div className="alert alert-warning ws-alert" role="alert">
          Your role does not have access to that page.
        </div>
      )}

      <h1 className="ws-page-title">Welcome, {user.name.split(' ')[0]}</h1>
      <p className="ws-page-lead">
        {ROLE_LABELS[user.role]} · {user.employeeId} · {officeFor(ctx, user.office).name}
      </p>

      {needsConsent && (
        <ConsentNotice
          office={{
            geofenceEnforced: Boolean(officeFor(ctx, user.office).enforceGeofence),
            selfieRequired: Boolean(officeFor(ctx, user.office).selfieRequired),
          }}
        />
      )}

      {clocksIn ? (
        <ClockPanel
          initialState={todayState}
          projects={projects}
          minDescription={ctx.settings?.eodMinDescriptionLength ?? 0}
          userId={user.id}
        />
      ) : (
        <Panel title="Attendance">
          <p className="ws-muted mb-0">
            You are exempt from clocking in and out, so there is no attendance, EOD or leave record
            against your account.
          </p>
        </Panel>
      )}

      {cycleStats && (
        <Panel title={'This cycle · ' + cycleStats.cycle.label}>
          <div className="ws-grid ws-grid-4">
            <Stat
              label="Attendance"
              value={cycleStats.attendanceRate + '%'}
              note={cycleStats.present + ' of ' + cycleStats.workingDays + ' working days'}
            />
            <Stat
              label="Late arrivals"
              value={cycleStats.late}
              note={
                cycleStats.deductionDays > 0
                  ? formatDays(cycleStats.deductionDays) + ' day deduction'
                  : 'No deduction yet'
              }
            />
            <Stat label="Hours worked" value={formatDuration(cycleStats.workedMinutes)} />
            <Stat
              label="Paid leave left"
              value={balance ? formatDays(balance.remaining) : '—'}
              note={balance ? 'of ' + formatDays(balance.quota + balance.carriedIn) : null}
            />
          </div>
          <p className="ws-faint mb-0 mt-3" style={{ fontSize: '0.82rem' }}>
            The cycle runs {cycleStats.cycle.startDate} to {cycleStats.cycle.endDate}.
          </p>
        </Panel>
      )}

      {approvals && (
        <Panel
          title="Waiting for you"
          action={
            <Link href="/workspace/approvals" className="btn ws-btn-ghost ws-btn-sm">
              Open approvals
            </Link>
          }
        >
          {approvals.requests.length + approvals.leaves.length === 0 ? (
            <Empty title="Nothing to approve">
              Leave applications and requests from the team will appear here.
            </Empty>
          ) : (
            <div className="ws-grid ws-grid-3">
              <Stat label="Leave applications" value={approvals.leaves.length} />
              <Stat label="Other requests" value={approvals.requests.length} />
              <Stat label="Total" value={approvals.leaves.length + approvals.requests.length} />
            </div>
          )}
        </Panel>
      )}

      {live && (
        <Panel
          title="Who is in now"
          action={
            can(user, P.ATTENDANCE_VIEW_ALL) ? (
              <Link href="/workspace/team" className="btn ws-btn-ghost ws-btn-sm">
                Full day sheet
              </Link>
            ) : null
          }
        >
          <LiveBoard initial={live} canDrillDown={can(user, P.ATTENDANCE_VIEW_ALL)} />
        </Panel>
      )}
    </div>
  );
}

async function loadProjects() {
  await connectDB();
  const projects = await Project.find({ active: true }).sort({ client: 1, name: 1 }).lean();
  return projects.map((p) => ({ id: String(p._id), name: p.name, client: p.client ?? null }));
}

/** This cycle's headline numbers for the person looking at the page. */
async function loadCycleStats(ctx, user) {
  const cycle = cycleFor(ctx, user, new Date());
  const days = await buildDayRange({
    user,
    fromDate: cycle.startDate,
    toDate: cycle.endDate,
    ctx,
  });

  let workingDays = 0;
  let present = 0;
  let late = 0;
  let workedMinutes = 0;
  for (const day of days) {
    if (day.computed.isWorkingDay) workingDays += 1;
    if (day.computed.countsAsPresent) present += 1;
    if (day.computed.lateByMinutes > 0) late += 1;
    workedMinutes += day.computed.workedMinutes;
  }

  return {
    cycle,
    workingDays,
    present,
    late,
    workedMinutes,
    deductionDays: lateDeductionDays(late, ctx.rules),
    attendanceRate: workingDays ? Math.round((present / workingDays) * 1000) / 10 : 0,
  };
}
