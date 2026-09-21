import Link from 'next/link';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P, can } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Department from '@/models/workspace/Department';
import Project from '@/models/workspace/Project';
import User from '@/models/workspace/User';
import { buildReport, REPORT_LABELS, REPORTS } from '@/lib/workspace/services/reports';
import { getWorkspaceContext, cycleFor } from '@/lib/workspace/context';
import { listCycles } from '@/lib/workspace/calc/cycle';
import { PageHead, Panel, Empty, TableWrap } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

/**
 * Every report the spec lists, rendered from the same `{ columns, rows }`
 * shape the export route uses — so what you see on screen and what lands in
 * the spreadsheet cannot drift apart.
 */
export default async function ReportsPage({ searchParams }) {
  const user = await requirePagePermission(P.REPORTS_VIEW);
  const sp = (await searchParams) ?? {};

  const key = typeof sp.key === 'string' && REPORT_LABELS[sp.key] ? sp.key : REPORTS.REGISTER;
  const filters = {
    from: typeof sp.from === 'string' ? sp.from : undefined,
    to: typeof sp.to === 'string' ? sp.to : undefined,
    cycleKey: typeof sp.cycleKey === 'string' ? sp.cycleKey : undefined,
    office: typeof sp.office === 'string' ? sp.office : undefined,
    departmentId: typeof sp.departmentId === 'string' ? sp.departmentId : undefined,
    userId: typeof sp.userId === 'string' ? sp.userId : undefined,
    projectId: typeof sp.projectId === 'string' ? sp.projectId : undefined,
  };

  await connectDB();
  const ctx = await getWorkspaceContext();
  const [departments, projects, people] = await Promise.all([
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Project.find({ active: true }).sort({ client: 1, name: 1 }).lean(),
    User.find({}).select('name employeeId').sort({ name: 1 }).lean(),
  ]);

  // The last year of cycles, newest first, for the picker.
  const now = new Date();
  const cycles = listCycles(
    new Date(now.getFullYear() - 1, now.getMonth(), 1),
    now,
    ctx.cycleHistory,
    'Asia/Karachi'
  ).reverse();

  let report = null;
  let error = null;
  try {
    report = await buildReport({ key, filters });
  } catch (err) {
    error = err.message;
  }

  const exportParams = new URLSearchParams();
  exportParams.set('key', key);
  for (const [name, value] of Object.entries(filters)) {
    if (value) exportParams.set(name, value);
  }

  return (
    <div className="ws-page">
      <PageHead
        title="Reports"
        lead={report ? report.title + ' · ' + report.subtitle : REPORT_LABELS[key]}
        actions={
          can(user, P.REPORTS_EXPORT) && report ? (
            <>
              <Link
                href={'/api/workspace/reports/export?' + exportParams.toString() + '&format=xlsx'}
                className="btn ws-btn-primary ws-btn-sm"
              >
                Export Excel
              </Link>
              <Link
                href={'/api/workspace/reports/export?' + exportParams.toString() + '&format=csv'}
                className="btn ws-btn-ghost ws-btn-sm"
              >
                Export CSV
              </Link>
            </>
          ) : null
        }
      />

      <Panel>
        <Filters
          fields={[
            {
              name: 'key',
              label: 'Report',
              type: 'select',
              placeholder: 'Monthly attendance register',
              options: Object.entries(REPORT_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              name: 'cycleKey',
              label: 'Cycle',
              type: 'select',
              placeholder: 'Current',
              options: cycles.map((c) => ({ value: c.key, label: c.label })),
            },
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
              name: 'userId',
              label: 'Employee',
              type: 'select',
              options: people.map((p) => ({ value: String(p._id), label: p.name })),
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

        {error && (
          <div className="alert alert-warning ws-alert" role="alert">
            {error}
          </div>
        )}

        {report && report.rows.length === 0 && (
          <Empty title="Nothing to report for these filters">
            Widen the date range, or clear a filter.
          </Empty>
        )}

        {report && report.rows.length > 0 && (
          <>
            <TableWrap label={report.title}>
              <thead>
                <tr>
                  {report.columns.map((column) => (
                    <th
                      scope="col"
                      key={column.key}
                      className={column.type === 'number' ? 'ws-num' : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.slice(0, 250).map((row, index) => (
                  <tr key={index}>
                    {report.columns.map((column) => (
                      <td
                        key={column.key}
                        className={
                          (column.type === 'number' ? 'ws-num ws-mono ' : '') +
                          (column.key === 'description' ? 'ws-wrap' : '')
                        }
                      >
                        {row[column.key] === '' || row[column.key] == null
                          ? '—'
                          : String(row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <p className="ws-faint mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
              {report.rows.length} row(s)
              {report.rows.length > 250
                ? ' — showing the first 250. Export for the full set.'
                : '.'}
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
