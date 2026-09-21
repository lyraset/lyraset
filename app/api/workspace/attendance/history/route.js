import { z } from 'zod';
import { P, can } from '@/lib/workspace/permissions';
import { requireApiUser, HttpError } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, dateString, objectId } from '@/lib/workspace/validation';
import { buildDayRange } from '@/lib/workspace/services/attendance';
import { getWorkspaceContext, cycleFor } from '@/lib/workspace/context';
import { connectDB } from '@/lib/workspace/db';
import User from '@/models/workspace/User';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  userId: objectId.optional(),
});

/**
 * A day-by-day attendance history.
 *
 * Without `userId` it is your own, which every employee may read. Asking for
 * someone else's needs attendance:view_all, so one route serves both the
 * employee history page and the leadership drill-down without a second
 * permission model.
 */
export const GET = api(async (req) => {
  const actor = await requireApiUser();
  const { from, to, userId } = parseQuery(Schema, query(req));

  let target = actor;
  if (userId && userId !== actor.id) {
    if (!can(actor, P.ATTENDANCE_VIEW_ALL)) {
      throw new HttpError(403, 'You can only view your own attendance.');
    }
    await connectDB();
    const found = await User.findById(userId).lean();
    if (!found) throw new HttpError(404, 'That employee no longer has an account.');
    target = { ...found, id: String(found._id) };
  } else if (!can(actor, P.ATTENDANCE_SELF) && !can(actor, P.ATTENDANCE_VIEW_ALL)) {
    throw new HttpError(403, "You don't have attendance records.");
  }

  const ctx = await getWorkspaceContext();
  const cycle = cycleFor(ctx, target, new Date());
  const days = await buildDayRange({
    user: target,
    fromDate: from ?? cycle.startDate,
    toDate: to ?? cycle.endDate,
    ctx,
  });

  return json({
    userId: target.id,
    name: target.name,
    cycle,
    from: from ?? cycle.startDate,
    to: to ?? cycle.endDate,
    days,
  });
});
