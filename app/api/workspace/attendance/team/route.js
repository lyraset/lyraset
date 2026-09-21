import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, dateString, office, objectId } from '@/lib/workspace/validation';
import { buildTeamDay } from '@/lib/workspace/services/team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  date: dateString.optional(),
  office: office.optional(),
  departmentId: objectId.optional(),
  status: z.string().trim().max(30).optional(),
});

/** The daily attendance sheet for everyone. */
export const GET = api(async (req) => {
  await requireApiPermission(P.ATTENDANCE_VIEW_ALL);
  const { date, ...filters } = parseQuery(Schema, query(req));
  const result = await buildTeamDay({ date: date ?? null, filters });
  return json(result);
});
