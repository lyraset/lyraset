import { z } from 'zod';
import { P, can } from '@/lib/workspace/permissions';
import { requireApiUser, requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson, params } from '@/lib/workspace/route';
import { parseBody, objectId, asset } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import Eod from '@/models/workspace/Eod';
import { serializeEod, editEod, isWithinEditWindow } from '@/lib/workspace/services/eod';
import { getWorkspaceContext } from '@/lib/workspace/context';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** One EOD. Your own, or anyone's with eod:view_all. */
export const GET = api(async (req, context) => {
  const user = await requireApiUser();
  const { id } = await params(context);

  await connectDB();
  const eod = await Eod.findById(id).lean();
  if (!eod) throw new HttpError(404, 'That EOD no longer exists.');

  const own = String(eod.userId) === String(user.id);
  if (!own && !can(user, P.EOD_VIEW_ALL)) {
    throw new HttpError(403, 'You can only read your own EODs.');
  }

  const ctx = await getWorkspaceContext();
  return json({
    eod: {
      ...serializeEod(eod, { includeVersions: true }),
      editable: own && isWithinEditWindow(eod, ctx.settings),
    },
  });
});

const TaskSchema = z.object({
  projectId: objectId.nullish(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(4000),
  minutes: z.coerce.number().int().min(0).max(1440).nullish(),
  status: z.enum(['COMPLETED', 'IN_PROGRESS', 'BLOCKED']).default('COMPLETED'),
});

const EditSchema = z.object({
  tasks: z.array(TaskSchema).min(1).max(30),
  blockers: z.string().trim().max(4000).nullish(),
  tomorrowPlan: z.string().trim().max(4000).nullish(),
  links: z.array(z.string().trim().url().max(500)).max(10).optional(),
  attachments: z.array(asset).max(10).optional(),
});

/** Edit your own EOD inside the Owner's window. The old text is kept. */
export const PATCH = api(async (req, context) => {
  const user = await requireApiPermission(P.EOD_SUBMIT);
  const { id } = await params(context);
  const changes = parseBody(EditSchema, await readJson(req));

  const eod = await editEod({ user, eodId: id, changes });

  await logAudit({
    actorId: user.id,
    action: 'eod.edit',
    targetType: 'eod',
    targetId: eod.id,
    after: { workDate: eod.workDate, editCount: eod.editCount },
    req,
  });

  return json({ eod });
});
