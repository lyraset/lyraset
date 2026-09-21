import Link from 'next/link';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P, can } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Department from '@/models/workspace/Department';
import { buildTeamDay } from '@/lib/workspace/services/team';
import { STATUS, STATUS_LABELS, formatDuration } from '@/lib/workspace/calc/attendance';
import {
  PageHead,
  Panel,
  Stat,
  StatusBadge,
  Flags,
  TableWrap,
  Empty,
  Person,
  formatDate,
} from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team attendance' };

/**
 * The daily sheet: every employee's day on one screen.
 *
 * Each row is computed in that person's own timezone, so a Dubai row and an
 * Islamabad row are directly comparable even though 10:00 means two different
 * instants for them.
 */
export default async function TeamPage({ searchParams }) {
  const user = await requirePagePermission(P.ATTENDANCE_VIEW_ALL);
  const sp = (await searchParams) ?? {};

  const date = typeof sp.date === 'string' ? sp.date : null;
  const filters = {
    office: typeof sp.office === 'string' ? sp.office : undefined,
    departmentId: typeof sp.departmentId === 'string' ? sp.departmentId : undefined,
    status: typeof sp.status === 'string' ? sp.status : undefined,
  };

  await connectDB();
  const [{ rows, counts, date: resolvedDate }, departments] = await Promise.all([
    buildTeamDay({ date, filters }),
    Department.find({ active: true }).sort({ name: 1 }).lean(),
  ]);

  const canEdit = can(user, P.ATTENDANCE_EDIT);

  return (
    <div className="ws-page">
      <PageHead
        title="Team attendance"
        lead={'Everyone’s day for ' + formatDate(resolvedDate, { weekday: true })}
      />

      <div className="ws-grid ws-grid-4 mb-3">
        <Stat label="In" value={counts.in} note={counts.onBreak + ' on break'} />
        <Stat label="Late" value={counts.late} />
        <Stat label="Not in" value={counts.notIn} />
        <Stat
          label="On leave"
          value={counts.onLeave}
          note={counts.wfh + ' WFH · ' + counts.officialDuty + ' duty'}
        />
      </div>

      <Panel>
        <Filters
          fields={[
            { name: 'date', label: 'Date', type: 'date' },
            {
              name: 'office',
              label: 'Office',
              type: 'select',
              options: [
                { value: 'ISLAMABAD', label: 'Islamabad' },
                { value: 'DUBAI', label: 'Dubai' },
              ],
            },
            {
              name: 'departmentId',
              label: 'Department',
              type: 'select',
              options: departments.map((d) => ({ value: String(d._id), label: d.name })),
            },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: Object.values(STATUS)
                .filter((s) => s !== STATUS.EXEMPT)
                .map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            },
          ]}
        />

        {rows.length === 0 ? (
          <Empty title="Nobody matches these filters">
            Clear a filter, or pick a different date.
          </Empty>
        ) : (
          <TableWrap label="Team attendance for the selected day">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Office</th>
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
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <Link href={'/workspace/team/' + row.userId} className="text-decoration-none">
                      <Person
                        name={row.name}
                        meta={row.employeeId + ' · ' + (row.department ?? 'No department')}
                      />
                    </Link>
                  </td>
                  <td className="ws-muted">{row.office}</td>
                  <td className="ws-mono ws-muted">
                    {row.shift ? row.shift.start + '–' + row.shift.end : '—'}
                  </td>
                  <td className="ws-mono">{row.localClockIn ?? '—'}</td>
                  <td className="ws-mono">{row.localClockOut ?? '—'}</td>
                  <td className="ws-mono ws-num">{formatDuration(row.workedMinutes)}</td>
                  <td className="ws-mono ws-num">{row.breakMinutes || '—'}</td>
                  <td>
                    <StatusBadge status={row.status} />{' '}
                    <Flags flags={row.flags} hide={[row.status]} />
                    {row.officialDutyPending && <span className="ws-flag">Duty pending</span>}
                    {row.edited && <span className="ws-flag">Edited</span>}
                  </td>
                  <td className="ws-muted">
                    {row.eodSubmitted ? 'Yes' : row.clockIn ? 'Missing' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <p className="ws-faint" style={{ fontSize: '0.82rem' }}>
        {canEdit
          ? 'Open an employee to edit a day. Every edit needs a reason and is recorded in the audit log.'
          : 'This view is read-only for your role.'}
      </p>
    </div>
  );
}
