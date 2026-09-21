import Link from 'next/link';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { listPeriods } from '@/lib/workspace/services/payroll';
import { buildReport, REPORTS } from '@/lib/workspace/services/reports';
import { PageHead, Panel, Empty, TableWrap } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';
import PayrollClose from '@/components/workspace/PayrollClose';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payroll close' };

/**
 * Review a cycle, then lock it.
 *
 * The summary on this page is the same payroll report the export produces, so
 * what the Owner signs off on is exactly what lands in the spreadsheet.
 */
export default async function PayrollClosePage({ searchParams }) {
  await requirePagePermission(P.PAYROLL_LOCK);
  const sp = (await searchParams) ?? {};

  const office = typeof sp.office === 'string' ? sp.office : 'ISLAMABAD';
  const cycleKey = typeof sp.cycleKey === 'string' ? sp.cycleKey : undefined;

  const periods = await listPeriods({ office });

  let summary = null;
  let summaryError = null;
  try {
    summary = await buildReport({ key: REPORTS.PAYROLL, filters: { office, cycleKey } });
  } catch (err) {
    summaryError = err.message;
  }

  const exportParams = new URLSearchParams({ key: REPORTS.PAYROLL, office, format: 'xlsx' });
  if (cycleKey) exportParams.set('cycleKey', cycleKey);

  return (
    <div className="ws-page">
      <PageHead
        title="Payroll close"
        lead="Review a cycle, then lock it. A locked cycle is read-only for everyone, including you."
        actions={
          summary ? (
            <Link
              href={'/api/workspace/reports/export?' + exportParams.toString()}
              className="btn ws-btn-ghost ws-btn-sm"
            >
              Export summary
            </Link>
          ) : null
        }
      />

      <Panel>
        <Filters
          fields={[
            {
              name: 'office',
              label: 'Office',
              type: 'select',
              placeholder: 'Islamabad',
              options: [
                { value: 'ISLAMABAD', label: 'Islamabad' },
                { value: 'DUBAI', label: 'Dubai' },
              ],
            },
            {
              name: 'cycleKey',
              label: 'Cycle',
              type: 'select',
              placeholder: 'Current',
              options: periods.map((p) => ({ value: p.cycleKey, label: p.cycleLabel })),
            },
          ]}
        />
        <PayrollClose office={office} periods={periods} />
      </Panel>

      <Panel title={summary ? 'Payroll summary · ' + summary.subtitle : 'Payroll summary'}>
        {summaryError && (
          <div className="alert alert-warning ws-alert" role="alert">
            {summaryError}
          </div>
        )}

        {summary && summary.rows.length === 0 && (
          <Empty title="No one to summarise for this cycle">
            Pick a different cycle or office.
          </Empty>
        )}

        {summary && summary.rows.length > 0 && (
          <TableWrap label="Payroll summary">
            <thead>
              <tr>
                {summary.columns.map((column) => (
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
              {summary.rows.map((row, index) => (
                <tr key={index}>
                  {summary.columns.map((column) => (
                    <td
                      key={column.key}
                      className={column.type === 'number' ? 'ws-num ws-mono' : undefined}
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
        )}
      </Panel>
    </div>
  );
}
