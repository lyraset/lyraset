import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, dateString, office, objectId } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import Eod from '@/models/workspace/Eod';
import User from '@/models/workspace/User';
import Attendance from '@/models/workspace/Attendance';
import { serializeEod, missingEodsFor } from '@/lib/workspace/services/eod';
import { getWorkspaceContext } from '@/lib/workspace/context';
import { todayInPakistan } from '@/lib/workspace/timezone';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  office: office.optional(),
  departmentId: objectId.optional(),
  userId: objectId.optional(),
  projectId: objectId.optional(),
});

/**
 * The daily feed of everyone's EODs, plus who is missing one.
 * A single date is the default view; a range serves the client report.
 */
export const GET = api(async (req) => {
  await requireApiPermission(P.EOD_VIEW_ALL);
  const filters = parseQuery(Schema, query(req));

  const ctx = await getWorkspaceContext();
  const date = filters.date ?? todayInPakistan();
  const from = filters.from ?? date;
  const to = filters.to ?? date;

  await connectDB();
  const peopleQuery = { status: 'ACTIVE' };
  if (filters.office) peopleQuery.office = filters.office;
  if (filters.departmentId) peopleQuery.departmentId = filters.departmentId;
  if (filters.userId) peopleQuery._id = filters.userId;
  const people = await User.find(peopleQuery)
    .select('name employeeId office department designation')
    .lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));

  const find = { userId: { $in: people.map((p) => p._id) }, workDate: { $gte: from, $lte: to } };
  if (filters.projectId) find['tasks.projectId'] = filters.projectId;

  const [eods, records] = await Promise.all([
    Eod.find(find).sort({ workDate: -1, submittedAt: -1 }).limit(500).lean(),
    Attendance.find({
      userId: { $in: people.map((p) => p._id) },
      workDate: { $gte: from, $lte: to },
    })
      .select('userId workDate workedMinutes status')
      .lean(),
  ]);

  const hoursBy = new Map(records.map((r) => [String(r.userId) + '|' + r.workDate, r]));
  const missing = await missingEodsFor({ workDate: date, office: filters.office ?? null, ctx });

  return json({
    date,
    from,
    to,
    eods: eods.map((e) => {
      const person = byId.get(String(e.userId));
      const attendance = hoursBy.get(String(e.userId) + '|' + e.workDate);
      return {
        ...serializeEod(e),
        userName: person?.name ?? null,
        employeeId: person?.employeeId ?? null,
        department: person?.department ?? null,
        workedMinutes: attendance?.workedMinutes ?? 0,
        attendanceStatus: attendance?.status ?? null,
      };
    }),
    missing,
  });
});
