import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P, can, ROLE_LABELS } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import User, { toSafeUser } from '@/models/workspace/User';
import Eod from '@/models/workspace/Eod';
import LeaveBalance from '@/models/workspace/LeaveBalance';
import { getWorkspaceContext, cycleFor, officeFor } from '@/lib/workspace/context';
import { buildDayRange } from '@/lib/workspace/services/attendance';
import { serializeEod } from '@/lib/workspace/services/eod';
import { formatDuration, lateDeductionDays } from '@/lib/workspace/calc/attendance';
import { remainingPaidLeave, formatDays } from '@/lib/workspace/calc/leave';
import { TIMEZONE } from '@/lib/workspace/timezone';
import { PageHead, Panel, Stat, Empty, formatDate } from '@/components/workspace/ui';
import DrillDown from '@/components/workspace/DrillDown';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const person = await User.findById(id)
    .select('name')
    .lean()
    .catch(() => null);
  return { title: person?.name ? person.name : 'Employee' };
}

/**
 * One employee's cycle: attendance and the EOD side by side for each day,
 * with the stats that summarise it.
 *
 * The Owner gets an edit control on each day; everyone else with
 * attendance:view_all sees exactly the same data without it.
 */
export default async function EmployeeDrillDown({ params, searchParams }) {
  const viewer = await requirePagePermission(P.ATTENDANCE_VIEW_ALL);
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  await connectDB();
  const found = await User.findById(id)
    .lean()
    .catch(() => null);
  if (!found) notFound();

  const person = { ...found, id: String(found._id) };
  const ctx = await getWorkspaceContext();
  const cycle = cycleFor(ctx, new Date());
  const from = typeof sp.from === 'string' ? sp.from : cycle.startDate;
  const to = typeof sp.to === 'string' ? sp.to : cycle.endDate;

  const [days, eods, balance] = await Promise.all([
    buildDayRange({ user: person, fromDate: from, toDate: to, ctx }),
    Eod.find({ userId: person.id, workDate: { $gte: from, $lte: to } }).lean(),
    LeaveBalance.findOne({ userId: person.id, cycleKey: cycle.key }).lean(),
  ]);

  const eodByDate = new Map(eods.map((e) => [e.workDate, serializeEod(e)]));

  const totals = days.reduce(
    (acc, day) => {
      if (day.computed.isWorkingDay) acc.workingDays += 1;
      if (day.computed.countsAsPresent) acc.present += 1;
      if (day.computed.lateByMinutes > 0) {
        acc.late += 1;
        acc.lateMinutes += day.computed.lateByMinutes;
      }
      if (day.record?.clockIn) {
        acc.inMinutes += minutesOfDay(day.record.clockIn);
        acc.inDays += 1;
      }
      acc.workedMinutes += day.computed.workedMinutes;
      acc.overtimeMinutes += day.computed.overtimeMinutes;
      if (day.record?.overtimeApproved)
        acc.approvedOvertime += day.record.overtimeApprovedMinutes ?? 0;
      return acc;
    },
    {
      workingDays: 0,
      present: 0,
      late: 0,
      lateMinutes: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      approvedOvertime: 0,
      inMinutes: 0,
      inDays: 0,
    }
  );

  const safe = toSafeUser(found);
  const office = officeFor(ctx, found.office);

  return (
    <div className="ws-page">
      <PageHead
        title={safe.name}
        lead={
          safe.employeeId +
          ' · ' +
          ROLE_LABELS[safe.role] +
          ' · ' +
          (safe.designation ?? 'No designation') +
          ' · ' +
          office.name
        }
        actions={
          can(viewer, P.EMPLOYEES_MANAGE) ? (
            <Link href={'/workspace/employees/' + person.id} className="btn ws-btn-ghost ws-btn-sm">
              Open HR profile
            </Link>
          ) : null
        }
      />

      <div className="ws-grid ws-grid-4 mb-3">
        <Stat
          label="Attendance"
          value={
            (totals.workingDays
              ? Math.round((totals.present / totals.workingDays) * 1000) / 10
              : 0) + '%'
          }
          note={totals.present + ' of ' + totals.workingDays + ' working days'}
        />
        <Stat
          label="Late arrivals"
          value={totals.late}
          note={
            lateDeductionDays(totals.late, ctx.rules) > 0
              ? formatDays(lateDeductionDays(totals.late, ctx.rules)) + ' day deduction'
              : 'No deduction'
          }
        />
        <Stat
          label="Average in-time"
          value={totals.inDays ? formatClock(Math.round(totals.inMinutes / totals.inDays)) : '—'}
          note={
            'Average hours ' +
            (totals.inDays ? formatDuration(Math.round(totals.workedMinutes / totals.inDays)) : '—')
          }
        />
        <Stat
          label="Leave left"
          value={balance ? formatDays(remainingPaidLeave(balance, ctx.leaveSettings)) : '—'}
          note={'Overtime ' + formatDuration(totals.approvedOvertime) + ' approved'}
        />
      </div>

      <Panel title={'Cycle ' + cycle.label} tight>
        <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
          {cycle.startDate} to {cycle.endDate}. Each day shows attendance and what was reported for
          it.
        </p>
      </Panel>

      {days.length === 0 ? (
        <Empty title="Nothing in this range">Pick a different date range.</Empty>
      ) : (
        <DrillDown
          userId={person.id}
          userName={safe.name}
          days={days.map((day) => ({
            ...day,
            eod: eodByDate.get(day.workDate) ?? null,
          }))}
          canEdit={can(viewer, P.ATTENDANCE_EDIT)}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}

/** Minutes past midnight of an instant, in Pakistan time. */
function minutesOfDay(instant) {
  const text = new Date(instant).toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
