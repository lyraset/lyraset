import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission, HttpError } from '@/lib/workspace/auth';
import { api, json, readJson } from '@/lib/workspace/route';
import { parseBody, position, asset, objectId } from '@/lib/workspace/validation';
import { clockOutWithEod } from '@/lib/workspace/services/attendance';
import { validateTasks, decorateTasks } from '@/lib/workspace/services/eod';
import { getWorkspaceContext } from '@/lib/workspace/context';
import { logAudit, requestMeta } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TaskSchema = z.object({
  projectId: objectId.nullish(),
  title: z.string().trim().min(2, 'Give the task a title.').max(200),
  description: z.string().trim().min(1, 'Describe the work.').max(4000),
  minutes: z.coerce.number().int().min(0).max(1440).nullish(),
  status: z.enum(['COMPLETED', 'IN_PROGRESS', 'BLOCKED']).default('COMPLETED'),
});

const Schema = z.object({
  tasks: z.array(TaskSchema).min(1, 'Add at least one task.').max(30),
  blockers: z.string().trim().max(4000).nullish(),
  tomorrowPlan: z.string().trim().max(4000).nullish(),
  links: z.array(z.string().trim().url().max(500)).max(10).default([]),
  attachments: z.array(asset).max(10).default([]),
  position,
});

/**
 * Submit the EOD and clock out. One request, one transaction — the clock-out
 * time is stamped when the report is submitted, so a cancelled dialog leaves
 * the employee still clocked in.
 */
export const POST = api(async (req) => {
  const user = await requireApiPermission(P.EOD_SUBMIT);
  const input = parseBody(Schema, await readJson(req));

  const ctx = await getWorkspaceContext();
  const problems = validateTasks(input.tasks, ctx.settings);
  if (problems.length) throw new HttpError(400, problems[0]);

  const tasks = await decorateTasks(input.tasks);
  const meta = requestMeta(req);

  const result = await clockOutWithEod({
    user,
    eod: { ...input, tasks },
    ip: meta.ip,
    userAgent: meta.userAgent,
    position: input.position ?? null,
  });

  await logAudit({
    actorId: user.id,
    action: 'attendance.clock_out',
    targetType: 'attendance',
    targetId: result.record.id,
    after: {
      workDate: result.workDate,
      clockOut: result.record.clockOut,
      workedMinutes: result.record.workedMinutes,
      eodId: result.eodId,
    },
    req,
  });

  return json(result, 201);
});
