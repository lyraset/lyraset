import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { getWorkspaceContext, cycleFor } from '@/lib/workspace/context';
import { buildDayRange } from '@/lib/workspace/services/attendance';
import { formatDuration, lateDeductionDays } from '@/lib/workspace/calc/attendance';
import { formatDays } from '@/lib/workspace/calc/leave';
import {
  PageHead,
  Panel,
  Stat,
  StatusBadge,
  Flags,
  TableWrap,
  Empty,
  formatDate,
  formatTimeIn,
} from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My attendance' };

/**
 * The employee's own attendance history, one row per day of the cycle.
 *
 * Days are listed even when nothing happened on them: a blank Tuesday is
 * information, and a month that only lists the days you clocked in hides
 * exactly the days worth noticing.
 */
export default async function MyAttendancePage({ searchParams }) {
  const user = await requirePagePermission(P.ATTENDANCE_SELF);
  const sp = (await searchParams) ?? {};

  const ctx = await getWorkspaceContext();
  const cycle = cycleFor(ctx, user, new Date());
  const from = typeof sp.from === 'string' ? sp.from : cycle.startDate;
  const to = typeof sp.to === 'string' ? sp.to : cycle.endDate;

  const days = await buildDayRange({ user, fromDate: from, toDate: to, ctx });

  const totals = days.reduce(
    (acc, day) => {
      if (day.computed.isWorkingDay) acc.workingDays += 1;
      if (day.computed.countsAsPresent) acc.present += 1;
      if (day.computed.lateByMinutes > 0) acc.late += 1;
      acc.workedMinutes += day.computed.workedMinutes;
      acc.overtimeMinutes += day.computed.overtimeMinutes;
      return acc;
    },
    { workingDays: 0, present: 0, late: 0, workedMinutes: 0, overtimeMinutes: 0 }
  );

  const deduction = lateDeductionDays(totals.late, ctx.rules);

  return (
    <div className="ws-page">
      <PageHead
        title="My attendance"
        lead={'Cycle ' + cycle.label + ' · ' + cycle.startDate + ' to ' + cycle.endDate}
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
          note={deduction > 0 ? formatDays(deduction) + ' day deduction' : 'No deduction'}
        />
        <Stat label="Hours worked" value={formatDuration(totals.workedMinutes)} />
        <Stat
          label="Overtime"
          value={formatDuration(totals.overtimeMinutes)}
          note="Counts once approved"
        />
      </div>

      <Panel>
        <Filters
          fields={[
            { name: 'from', label: 'From', type: 'date' },
            { name: 'to', label: 'To', type: 'date' },
          ]}
        />

        {days.length === 0 ? (
          <Empty title="Nothing in this range">Pick a different date range to see more.</Empty>
        ) : (
          <TableWrap label="My attendance by day">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Shift</th>
                <th scope="col">In</th>
                <th scope="col">Out</th>
                <th scope="col" className="ws-num">
                  Worked
                </th>
                <th scope="col" className="ws-num">
                  Break
                </th>
                <th scope="col">Status</th>
                <th scope="col">EOD</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.workDate}>
                  <td>{formatDate(day.workDate, { weekday: true })}</td>
                  <td className="ws-mono ws-muted">
                    {day.schedule.working ? day.schedule.start + '–' + day.schedule.end : '—'}
                  </td>
                  <td className="ws-mono">{formatTimeIn(day.record?.clockIn, user.timezone)}</td>
                  <td className="ws-mono">{formatTimeIn(day.record?.clockOut, user.timezone)}</td>
                  <td className="ws-mono ws-num">{formatDuration(day.computed.workedMinutes)}</td>
                  <td className="ws-mono ws-num">{day.computed.breakMinutes || '—'}</td>
                  <td>
                    <StatusBadge status={day.status} />{' '}
                    <Flags flags={day.computed.flags} hide={[day.status]} />
                    {day.computed.lateByMinutes > 0 && (
                      <span className="ws-flag">{day.computed.lateByMinutes}m late</span>
                    )}
                  </td>
                  <td className="ws-muted">
                    {day.eodSubmitted
                      ? 'Yes'
                      : day.computed.isWorkingDay && day.record?.clockIn
                        ? 'Missing'
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <p className="ws-faint" style={{ fontSize: '0.82rem' }}>
        Something wrong with a day? Ask for a correction from the Requests page — it goes to the
        Owner or the CEO for approval and the change is recorded.
      </p>
    </div>
  );
}
