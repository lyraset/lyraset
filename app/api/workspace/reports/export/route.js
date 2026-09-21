import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, query } from '@/lib/workspace/route';
import { parseQuery } from '@/lib/workspace/validation';
import { buildReport, toWorkbook, toCsv, reportFilename } from '@/lib/workspace/services/reports';
import { ReportQuerySchema } from '../route';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = ReportQuerySchema.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
});

/**
 * Download a report.
 *
 * Exporting needs reports:export, which is a separate permission from viewing
 * them — the MD can export, an employee can do neither.
 */
export const GET = api(async (req) => {
  const user = await requireApiPermission(P.REPORTS_EXPORT);
  const { key, format, ...filters } = parseQuery(Schema, query(req));

  const report = await buildReport({ key, filters });
  const filename = reportFilename(report, format);

  await logAudit({
    actorId: user.id,
    action: 'reports.export',
    targetType: 'report',
    targetId: key,
    meta: { format, filters, rows: report.rows.length },
    req,
  });

  if (format === 'csv') {
    return new Response(toCsv(report), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const buffer = await toWorkbook(report);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'no-store',
    },
  });
});
