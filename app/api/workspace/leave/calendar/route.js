import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, dateString, office } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import LeaveRequest from '@/models/workspace/LeaveRequest';
import LeaveType from '@/models/workspace/LeaveType';
import User from '@/models/workspace/User';
import Holiday from '@/models/workspace/Holiday';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  from: dateString,
  to: dateString,
  office: office.optional(),
});

/** Who is off on which day, for the leave calendar. */
export const GET = api(async (req) => {
  await requireApiPermission(P.LEAVE_CALENDAR_VIEW);
  const { from, to, office: officeCode } = parseQuery(Schema, query(req));

  await connectDB();
  const find = {
    status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
    approvedDates: { $gte: from, $lte: to },
  };
  if (officeCode) find.office = officeCode;

  const [requests, types, holidays] = await Promise.all([
    LeaveRequest.find(find).lean(),
    LeaveType.find({}).lean(),
    Holiday.find({ date: { $gte: from, $lte: to } }).lean(),
  ]);

  const people = await User.find({ _id: { $in: requests.map((r) => r.userId) } })
    .select('name employeeId office department')
    .lean();
  const userById = new Map(people.map((p) => [String(p._id), p]));
  const typeById = new Map(types.map((t) => [String(t._id), t]));

  // One entry per person per day, which is what a calendar cell renders.
  const byDate = {};
  for (const request of requests) {
    const person = userById.get(String(request.userId));
    const type = typeById.get(String(request.leaveTypeId));
    for (const date of request.approvedDates ?? []) {
      if (date < from || date > to) continue;
      byDate[date] ??= [];
      byDate[date].push({
        userId: String(request.userId),
        name: person?.name ?? 'Unknown',
        employeeId: person?.employeeId ?? null,
        department: person?.department ?? null,
        office: request.office,
        leaveTypeName: type?.name ?? null,
        leaveTypeColor: type?.color ?? '#3d7bff',
        halfDay: Boolean(request.halfDay),
        requestId: String(request._id),
      });
    }
  }

  return json({
    from,
    to,
    byDate,
    holidays: holidays
      .filter((h) => !officeCode || !h.offices?.length || h.offices.includes(officeCode))
      .map((h) => ({
        date: h.date,
        name: h.name,
        isClosure: h.isClosure,
        offices: h.offices ?? [],
      })),
  });
});
