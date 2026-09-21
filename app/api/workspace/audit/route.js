import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query } from '@/lib/workspace/route';
import { parseQuery, objectId, paging, escapeRegex } from '@/lib/workspace/validation';
import { connectDB } from '@/lib/workspace/db';
import AuditLog from '@/models/workspace/AuditLog';
import User from '@/models/workspace/User';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = paging.extend({
  action: z.string().trim().max(60).optional(),
  actorId: objectId.optional(),
  targetType: z.string().trim().max(40).optional(),
  targetId: z.string().trim().max(60).optional(),
});

/**
 * The audit log (Owner and CEO).
 *
 * Read-only by design: there is no route that edits or deletes an entry, so
 * the record of who changed what cannot itself be changed from the portal.
 */
export const GET = api(async (req) => {
  await requireApiPermission(P.AUDIT_VIEW);
  const { page, pageSize, ...filters } = parseQuery(Schema, query(req));

  await connectDB();
  const find = {};
  if (filters.action) find.action = { $regex: '^' + escapeRegex(filters.action) };
  if (filters.actorId) find.actorId = filters.actorId;
  if (filters.targetType) find.targetType = filters.targetType;
  if (filters.targetId) find.targetId = filters.targetId;

  const [entries, total] = await Promise.all([
    AuditLog.find(find)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AuditLog.countDocuments(find),
  ]);

  const actors = await User.find({ _id: { $in: entries.map((e) => e.actorId).filter(Boolean) } })
    .select('name employeeId role')
    .lean();
  const byId = new Map(actors.map((a) => [String(a._id), a]));

  return json({
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    entries: entries.map((e) => ({
      id: String(e._id),
      action: e.action,
      actorId: e.actorId ? String(e.actorId) : null,
      actorName: e.actorId ? (byId.get(String(e.actorId))?.name ?? 'Deleted account') : 'System',
      actorRole: e.actorId ? (byId.get(String(e.actorId))?.role ?? null) : null,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
      meta: e.meta ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
      createdAt: e.createdAt,
    })),
  });
});
