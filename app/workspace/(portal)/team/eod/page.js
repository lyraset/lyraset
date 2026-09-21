import Link from 'next/link';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Eod from '@/models/workspace/Eod';
import User from '@/models/workspace/User';
import Attendance from '@/models/workspace/Attendance';
import Project from '@/models/workspace/Project';
import Department from '@/models/workspace/Department';
import { getWorkspaceContext } from '@/lib/workspace/context';
import { serializeEod, missingEodsFor } from '@/lib/workspace/services/eod';
import { formatDuration } from '@/lib/workspace/calc/attendance';
import { PageHead, Panel, Empty, Person, TableWrap, formatDate } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team EODs' };

/**
 * The daily feed of everyone's reports, plus who still owes one.
 *
 * Filtering by client or project is what makes this usable for client
 * reporting: "everything we did for Reon Studio this cycle" is one filter and
 * an export away.
 */
export default async function TeamEodPage({ searchParams }) {
  await requirePagePermission(P.EOD_VIEW_ALL);
  const sp = (await searchParams) ?? {};

  const ctx = await getWorkspaceContext();
  const date = typeof sp.date === 'string' ? sp.date : new Date().toISOString().slice(0, 10);
  const from = typeof sp.from === 'string' ? sp.from : date;
  const to = typeof sp.to === 'string' ? sp.to : date;

  await connectDB();
  const peopleQuery = { status: 'ACTIVE' };
  if (typeof sp.office === 'string') peopleQuery.office = sp.office;
  if (typeof sp.departmentId === 'string') peopleQuery.departmentId = sp.departmentId;

  const people = await User.find(peopleQuery)
    .select('name employeeId office department designation')
    .lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));

  const find = { userId: { $in: people.map((p) => p._id) }, workDate: { $gte: from, $lte: to } };
  if (typeof sp.projectId === 'string') find['tasks.projectId'] = sp.projectId;

  const [eods, records, projects, departments, missing] = await Promise.all([
    Eod.find(find).sort({ workDate: -1, submittedAt: -1 }).limit(300).lean(),
    Attendance.find({
      userId: { $in: people.map((p) => p._id) },
      workDate: { $gte: from, $lte: to },
    })
      .select('userId workDate workedMinutes')
      .lean(),
    Project.find({ active: true }).sort({ client: 1, name: 1 }).lean(),
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    missingEodsFor({ workDate: date, office: sp.office ?? null, ctx }),
  ]);

  const hoursBy = new Map(
    records.map((r) => [String(r.userId) + '|' + r.workDate, r.workedMinutes ?? 0])
  );

  return (
    <div className="ws-page">
      <PageHead
        title="Team EODs"
        lead={
          from === to
            ? formatDate(from, { weekday: true })
            : formatDate(from) + ' to ' + formatDate(to)
        }
        actions={
          <Link
            href={
              '/api/workspace/reports/export?key=work-log&format=xlsx&from=' +
              from +
              '&to=' +
              to +
              (sp.projectId ? '&projectId=' + sp.projectId : '')
            }
            className="btn ws-btn-ghost ws-btn-sm"
          >
            Export work log
          </Link>
        }
      />

      <Panel>
        <Filters
          fields={[
            { name: 'from', label: 'From', type: 'date' },
            { name: 'to', label: 'To', type: 'date' },
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
              name: 'projectId',
              label: 'Client / project',
              type: 'select',
              options: projects.map((p) => ({
                value: String(p._id),
                label: p.client ? p.client + ' — ' + p.name : p.name,
              })),
            },
          ]}
        />

        {eods.length === 0 ? (
          <Empty title="No reports in this range">
            Reports appear here as people clock out. Widen the dates or clear a filter.
          </Empty>
        ) : (
          <ul className="list-unstyled mb-0">
            {eods.map((eod) => {
              const person = byId.get(String(eod.userId));
              const report = serializeEod(eod);
              const worked = hoursBy.get(String(eod.userId) + '|' + eod.workDate) ?? 0;
              return (
                <li className="ws-task" key={report.id}>
                  <div className="ws-task-head">
                    <Link
                      href={'/workspace/team/' + String(eod.userId)}
                      className="text-decoration-none"
                    >
                      <Person
                        name={person?.name ?? 'Unknown'}
                        meta={
                          formatDate(eod.workDate, { weekday: true }) +
                          ' · ' +
                          formatDuration(worked)
                        }
                      />
                    </Link>
                    <span className="ws-muted" style={{ fontSize: '0.82rem' }}>
                      {report.tasks.length} task(s)
                      {report.lateSubmission && (
                        <span className="ws-flag ms-2">Late submission</span>
                      )}
                      {report.edited && <span className="ws-flag ms-2">Edited</span>}
                    </span>
                  </div>

                  {report.tasks.map((task, index) => (
                    <div key={index} className="mb-2">
                      <p className="mb-1" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {task.title}
                        <span className="ws-flag ms-2">
                          {task.projectName ?? 'Internal / Other'}
                        </span>
                      </p>
                      <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                        {task.description}
                        {task.minutes ? ' · ' + formatDuration(task.minutes) : ''}
                      </p>
                    </div>
                  ))}

                  {report.blockers && (
                    <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                      <strong>Blockers:</strong> {report.blockers}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title={'Missing EODs for ' + formatDate(date)}>
        {missing.length === 0 ? (
          <Empty title="Everyone has reported">
            Nobody who worked that day is missing a report.
          </Empty>
        ) : (
          <TableWrap label="People missing an EOD">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Department</th>
                <th scope="col">Office</th>
                <th scope="col">Clocked in</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={'/workspace/team/' + row.id} className="text-decoration-none">
                      <Person name={row.name} meta={row.employeeId} />
                    </Link>
                  </td>
                  <td className="ws-muted">{row.department ?? '—'}</td>
                  <td className="ws-muted">{row.office}</td>
                  <td className="ws-mono">
                    {row.clockIn
                      ? new Date(row.clockIn).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="ws-muted">
                    {row.autoClosed ? 'Clocked out automatically' : 'Still owed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
