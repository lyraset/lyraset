import { DateTime } from 'luxon';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import LeaveRequest from '@/models/workspace/LeaveRequest';
import LeaveType from '@/models/workspace/LeaveType';
import User from '@/models/workspace/User';
import Holiday from '@/models/workspace/Holiday';
import { PageHead, Panel, Empty, formatDate } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leave calendar' };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Who is off, on which day, in one month.
 *
 * A calendar rather than a list because the question it answers is "can we
 * afford to lose another person that week?", which a list cannot show.
 */
export default async function LeaveCalendarPage({ searchParams }) {
  await requirePagePermission(P.LEAVE_CALENDAR_VIEW);
  const sp = (await searchParams) ?? {};

  const monthKey =
    typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : DateTime.now().toFormat('yyyy-MM');
  const monthStart = DateTime.fromISO(monthKey + '-01');
  const from = monthStart.toISODate();
  const to = monthStart.endOf('month').toISODate();
  const office = typeof sp.office === 'string' ? sp.office : null;

  await connectDB();
  const find = {
    status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
    approvedDates: { $gte: from, $lte: to },
  };
  if (office) find.office = office;

  const [requests, types, holidays] = await Promise.all([
    LeaveRequest.find(find).lean(),
    LeaveType.find({}).lean(),
    Holiday.find({ date: { $gte: from, $lte: to } }).lean(),
  ]);

  const people = await User.find({ _id: { $in: requests.map((r) => r.userId) } })
    .select('name employeeId')
    .lean();
  const userById = new Map(people.map((p) => [String(p._id), p]));
  const typeById = new Map(types.map((t) => [String(t._id), t]));

  const byDate = {};
  for (const request of requests) {
    for (const date of request.approvedDates ?? []) {
      if (date < from || date > to) continue;
      const type = typeById.get(String(request.leaveTypeId));
      (byDate[date] ??= []).push({
        name: userById.get(String(request.userId))?.name ?? 'Unknown',
        color: type?.color ?? '#3d7bff',
        typeName: type?.name ?? 'Leave',
        halfDay: Boolean(request.halfDay),
      });
    }
  }

  const holidayByDate = new Map(
    holidays
      .filter((h) => !office || !h.offices?.length || h.offices.includes(office))
      .map((h) => [h.date, h])
  );

  // Pad the grid so the 1st lands under the right weekday.
  const leading = monthStart.weekday - 1;
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: monthStart.daysInMonth }, (_, i) => monthStart.plus({ days: i })),
  ];

  const total = Object.values(byDate).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="ws-page">
      <PageHead title="Leave calendar" lead={monthStart.toFormat('LLLL yyyy')} />

      <Panel>
        <Filters
          fields={[
            { name: 'month', label: 'Month', type: 'month' },
            {
              name: 'office',
              label: 'Office',
              type: 'select',
              options: [
                { value: 'ISLAMABAD', label: 'Islamabad' },
                { value: 'DUBAI', label: 'Dubai' },
              ],
            },
          ]}
        />

        {total === 0 && holidayByDate.size === 0 ? (
          <Empty title="Nobody is off this month">
            Approved leave and holidays for the selected office will show here.
          </Empty>
        ) : (
          <div
            className="ws-calendar"
            role="grid"
            aria-label={'Leave for ' + monthStart.toFormat('LLLL yyyy')}
          >
            {WEEKDAYS.map((day) => (
              <div className="ws-cal-head" key={day} role="columnheader">
                {day}
              </div>
            ))}

            {cells.map((cell, index) => {
              if (!cell)
                return (
                  <div className="ws-cal-day is-empty" key={'pad-' + index} aria-hidden="true" />
                );
              const date = cell.toISODate();
              const people = byDate[date] ?? [];
              const holiday = holidayByDate.get(date);
              return (
                <div className="ws-cal-day" key={date} role="gridcell">
                  <span className="ws-cal-date">{cell.day}</span>
                  {holiday && (
                    <span className="ws-cal-note" style={{ color: 'var(--ws-info)' }}>
                      {holiday.name}
                    </span>
                  )}
                  {people.slice(0, 3).map((person, i) => (
                    <span className="ws-cal-note" key={i}>
                      <span
                        className="ws-cal-dot me-1"
                        style={{ background: person.color }}
                        aria-hidden="true"
                      />
                      {person.name.split(' ')[0]}
                      {person.halfDay ? ' (½)' : ''}
                    </span>
                  ))}
                  {people.length > 3 && (
                    <span className="ws-cal-note ws-faint">+{people.length - 3} more</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {types.length > 0 && (
        <Panel title="Leave types" tight>
          <ul className="ws-inline-list">
            {types.map((type) => (
              <li key={String(type._id)}>
                <span
                  className="ws-cal-dot me-2"
                  style={{ background: type.color }}
                  aria-hidden="true"
                />
                <span className="ws-muted">
                  {type.name} ({type.paid ? 'paid' : 'unpaid'})
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="ws-faint" style={{ fontSize: '0.82rem' }}>
        Showing {formatDate(from)} to {formatDate(to)}. Only approved leave appears here.
      </p>
    </div>
  );
}
