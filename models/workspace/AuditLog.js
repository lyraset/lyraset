import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const AuditLogSchema = new mongoose.Schema(
  {
    actorId: { type: ObjectId, ref: 'WorkspaceUser', default: null },
    action: { type: String, required: true }, // e.g. auth.login, employee.create
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    before: { type: Mixed, default: null },
    after: { type: Mixed, default: null },
    meta: { type: Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'workspace_audit_logs' }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export default mongoose.models.WorkspaceAuditLog ||
  mongoose.model('WorkspaceAuditLog', AuditLogSchema);
