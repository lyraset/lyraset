import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query, readJson } from '@/lib/workspace/route';
import {
  parseBody,
  parseQuery,
  dateString,
  objectId,
  asset,
  escapeRegex,
} from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import Eod from '@/models/workspace/Eod';
import Attendance from '@/models/workspace/Attendance';
import { serializeEod, submitLateEod, isWithinEditWindow } from '@/lib/workspace/services/eod';
import { getWorkspaceContext, cycleFor } from '@/lib/workspace/context';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ListSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  projectId: objectId.optional(),
  status: z.enum(['COMPLETED', 'IN_PROGRESS', 'BLOCKED']).optional(),
  q: z.string().trim().max(120).optional(),
});

/** Your own EOD history, with the filters the list and calendar views use. */
export const GET = api(async (req) => {
  const user = await requireApiPermission(P.EOD_SUBMIT);
  const filters = parseQuery(ListSchema, query(req));

  const ctx = await getWorkspaceContext();
  const cycle = cycleFor(ctx, user, new Date());
  const from = filters.from ?? cycle.startDate;
  const to = filters.to ?? cycle.endDate;

  await connectDB();
  const find = { userId: user.id, workDate: { $gte: from, $lte: to } };
  if (filters.projectId) find['tasks.projectId'] = filters.projectId;
  if (filters.status) find['tasks.status'] = filters.status;
  if (filters.q) {
    const safe = escapeRegex(filters.q);
    find.$or = [
      { 'tasks.title': { $regex: safe, $options: 'i' } },
      { 'tasks.description': { $regex: safe, $options: 'i' } },
    ];
  }

  const [eods, records] = await Promise.all([
    Eod.find(find).sort({ workDate: -1 }).limit(200).lean(),
    Attendance.find({ userId: user.id, workDate: { $gte: from, $lte: to } })
      .select('workDate workedMinutes status')
      .lean(),
  ]);
  const hoursByDate = new Map(records.map((r) => [r.workDate, r]));

  return json({
    from,
    to,
    cycle,
    eods: eods.map((e) => ({
      ...serializeEod(e),
      workedMinutes: hoursByDate.get(e.workDate)?.workedMinutes ?? 0,
      attendanceStatus: hoursByDate.get(e.workDate)?.status ?? null,
      editable: isWithinEditWindow(e, ctx.settings),
    })),
  });
});

const TaskSchema = z.object({
  projectId: objectId.nullish(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(4000),
  minutes: z.coerce.number().int().min(0).max(1440).nullish(),
  status: z.enum(['COMPLETED', 'IN_PROGRESS', 'BLOCKED']).default('COMPLETED'),
});

const SubmitSchema = z.object({
  workDate: dateString,
  tasks: z.array(TaskSchema).min(1).max(30),
  blockers: z.string().trim().max(4000).nullish(),
  tomorrowPlan: z.string().trim().max(4000).nullish(),
  links: z.array(z.string().trim().url().max(500)).max(10).default([]),
  attachments: z.array(asset).max(10).default([]),
});

/** Submit an EOD for a day that was auto-closed. Flagged as a late submission. */
export const POST = api(async (req) => {
  const user = await requireApiPermission(P.EOD_SUBMIT);
  const input = parseBody(SubmitSchema, await readJson(req));

  const eod = await submitLateEod({ user, workDate: input.workDate, eod: input });

  await logAudit({
    actorId: user.id,
    action: 'eod.submit_late',
    targetType: 'eod',
    targetId: eod.id,
    after: { workDate: eod.workDate, tasks: eod.tasks.length },
    req,
  });

  return json({ eod }, 201);
});
