import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, office, objectId } from '@/lib/workspace/validation';
import { buildTeamDay } from '@/lib/workspace/services/team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  office: office.optional(),
  departmentId: objectId.optional(),
});

/** Who is in right now. The board polls this every 60 seconds. */
export const GET = api(async (req) => {
  await requireApiPermission(P.LIVE_BOARD_VIEW);
  const filters = parseQuery(Schema, query(req));
  const { rows, counts } = await buildTeamDay({ filters, live: true });
  return json({ rows, counts, refreshedAt: new Date().toISOString() });
});
