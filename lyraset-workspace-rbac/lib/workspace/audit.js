import { connectDB } from "./db.js";
import AuditLog from "../../models/workspace/AuditLog.js";

export function requestMeta(req) {
  if (!req?.headers) return {};
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) || null,
  };
}

export async function logAudit({
  actorId = null,
  action,
  targetType = null,
  targetId = null,
  before = null,
  after = null,
  meta = null,
  req = null,
}) {
  try {
    await connectDB();
    await AuditLog.create({ actorId, action, targetType, targetId, before, after, meta, ...requestMeta(req) });
  } catch (err) {
    console.error("[audit] failed to write", action, err);
  }
}
