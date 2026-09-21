import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import LeaveType from '@/models/workspace/LeaveType';
import { pendingApprovals } from '@/lib/workspace/services/requests';
import { serializeLeaveRequest } from '@/lib/workspace/services/leave';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  type: z.enum(['LEAVE', 'CORRECTION', 'WFH', 'OFFICIAL_DUTY', 'OVERTIME']).optional(),
});

/**
 * The approvals inbox: leaves and every other request type in one list.
 * The approver's own requests are excluded, because nobody approves their own.
 */
export const GET = api(async (req) => {
  const approver = await requireApiPermission(P.APPROVALS_MANAGE);
  const { type } = parseQuery(Schema, query(req));

  await connectDB();
  const { requests, leaves, usersById } = await pendingApprovals({ approver, type: type ?? null });
  const types = await LeaveType.find({}).lean();
  const typeById = new Map(types.map((t) => [String(t._id), t]));

  return json({
    requests,
    leaves: leaves.map((l) =>
      serializeLeaveRequest(l, {
        leaveType: typeById.get(String(l.leaveTypeId)),
        requester: usersById.get(String(l.userId)),
      })
    ),
    counts: {
      requests: requests.length,
      leaves: leaves.length,
      total: requests.length + leaves.length,
    },
  });
});
