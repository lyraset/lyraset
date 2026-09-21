import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, dateString, objectId, office } from '@/lib/workspace/validation';
import { buildReport, REPORTS, REPORT_LABELS } from '@/lib/workspace/services/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const ReportQuerySchema = z.object({
  key: z.enum(Object.values(REPORTS)),
  from: dateString.optional(),
  to: dateString.optional(),
  cycleKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Use a cycle in YYYY-MM format.')
    .optional(),
  office: office.optional(),
  departmentId: objectId.optional(),
  userId: objectId.optional(),
  projectId: objectId.optional(),
});

/** Run a report and return it as rows, for on-screen display. */
export const GET = api(async (req) => {
  await requireApiPermission(P.REPORTS_VIEW);
  const { key, ...filters } = parseQuery(ReportQuerySchema, query(req));
  const report = await buildReport({ key, filters });
  return json({ ...report, key, available: REPORT_LABELS });
});
