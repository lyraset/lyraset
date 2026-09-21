import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody } from '@/lib/workspace/validation';
import { startBreak, endBreak } from '@/lib/workspace/services/attendance';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  action: z.enum(['START', 'END']),
  type: z.enum(['LUNCH', 'PRAYER', 'OTHER']).default('OTHER'),
});

export const POST = api(async (req) => {
  const user = await requireApiPermission(P.ATTENDANCE_SELF);
  const { action, type } = parseBody(Schema, await readJson(req));

  const record = action === 'START' ? await startBreak({ user, type }) : await endBreak({ user });

  await logAudit({
    actorId: user.id,
    action: 'attendance.break_' + action.toLowerCase(),
    targetType: 'attendance',
    targetId: record.id,
    after: { breaks: record.breaks.length, type },
    req,
  });

  return json({ record });
});
