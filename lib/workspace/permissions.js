/**
 * LYRASET Workspace — Role-Based Access Control (single source of truth)
 *
 * Pure module: no database or Node-only APIs, so the same rules run in
 * middleware (edge), server components, API routes, scripts and tests.
 * Never check roles by name elsewhere in the codebase — always ask can().
 */

export const ROLES = Object.freeze({
  OWNER: "OWNER",
  CEO: "CEO",
  MD: "MD",
  EMPLOYEE: "EMPLOYEE",
});

export const ROLE_LABELS = Object.freeze({
  OWNER: "Owner",
  CEO: "Chief Executive Officer",
  MD: "Managing Director",
  EMPLOYEE: "Employee",
});

export const P = Object.freeze({
  // Self-service
  PROFILE_VIEW_OWN: "profile:view_own",
  ATTENDANCE_SELF: "attendance:self", // clock in/out, breaks, own attendance history
  EOD_SUBMIT: "eod:submit", // submit EOD on clock-out, view own EOD history
  LEAVE_REQUEST: "leave:request", // apply for leave, view own balance
  REQUEST_SUBMIT: "request:submit", // corrections, WFH, official duty, overtime claims

  // Oversight (read-only)
  LIVE_BOARD_VIEW: "live_board:view",
  ATTENDANCE_VIEW_ALL: "attendance:view_all",
  EOD_VIEW_ALL: "eod:view_all",
  LEAVE_CALENDAR_VIEW: "leave_calendar:view",
  REPORTS_VIEW: "reports:view",
  REPORTS_EXPORT: "reports:export",

  // Decisions
  APPROVALS_MANAGE: "approvals:manage", // leaves, corrections, overtime, WFH, official duty

  // Administration
  ATTENDANCE_EDIT: "attendance:edit",
  EMPLOYEES_MANAGE: "employees:manage", // create accounts, set/reset passwords, deactivate
  SETTINGS_MANAGE: "settings:manage", // company month, shifts, leave types & quota, holidays, projects, EOD rules
  PAYROLL_LOCK: "payroll:lock",
  AUDIT_VIEW: "audit:view",
});

const SELF_SERVICE = [
  P.PROFILE_VIEW_OWN,
  P.ATTENDANCE_SELF,
  P.EOD_SUBMIT,
  P.LEAVE_REQUEST,
  P.REQUEST_SUBMIT,
];

const OVERSIGHT = [
  P.LIVE_BOARD_VIEW,
  P.ATTENDANCE_VIEW_ALL,
  P.EOD_VIEW_ALL,
  P.LEAVE_CALENDAR_VIEW,
  P.REPORTS_VIEW,
  P.REPORTS_EXPORT,
];

const ADMINISTRATION = [
  P.ATTENDANCE_EDIT,
  P.EMPLOYEES_MANAGE,
  P.SETTINGS_MANAGE,
  P.PAYROLL_LOCK,
];

export const ROLE_PERMISSIONS = Object.freeze({
  EMPLOYEE: Object.freeze([...SELF_SERVICE]),
  MD: Object.freeze([...SELF_SERVICE, ...OVERSIGHT]),
  OWNER: Object.freeze([
    ...SELF_SERVICE,
    ...OVERSIGHT,
    P.APPROVALS_MANAGE,
    ...ADMINISTRATION,
    P.AUDIT_VIEW,
  ]),
  // CEO never clocks in, so no self-service attendance/leave/EOD permissions.
  // CEO approves the Owner's own requests (no one approves themselves).
  CEO: Object.freeze([P.PROFILE_VIEW_OWN, ...OVERSIGHT, P.APPROVALS_MANAGE, P.AUDIT_VIEW]),
});

/** Permissions removed for anyone flagged requiresAttendance: false. */
export const ATTENDANCE_BOUND = Object.freeze([
  P.ATTENDANCE_SELF,
  P.EOD_SUBMIT,
  P.LEAVE_REQUEST,
  P.REQUEST_SUBMIT,
]);

/** Roles the Owner may assign from the portal. OWNER is bootstrapped by script only. */
export const ASSIGNABLE_ROLES = Object.freeze([ROLES.EMPLOYEE, ROLES.MD, ROLES.CEO]);

function idOf(user) {
  const id = user?.id ?? user?._id;
  return id ? String(id) : "";
}

/** Effective permission set for a user or session ({ role, requiresAttendance }). */
export function getPermissions(user) {
  const base = user && ROLE_PERMISSIONS[user.role];
  if (!base) return new Set();
  const perms = new Set(base);
  if (user.requiresAttendance === false) {
    for (const p of ATTENDANCE_BOUND) perms.delete(p);
  }
  return perms;
}

export function can(user, permission) {
  return getPermissions(user).has(permission);
}

export function canAny(user, permissions) {
  const perms = getPermissions(user);
  return permissions.some((p) => perms.has(p));
}

/**
 * Approver needs approvals:manage and can never approve their own request.
 * Result: employees & MD -> Owner or CEO; Owner -> CEO only.
 */
export function canApprove(approver, requester) {
  const a = idOf(approver);
  const r = idOf(requester);
  if (!a || !r || a === r) return false;
  return can(approver, P.APPROVALS_MANAGE);
}

export function canAssignRole(actor, role) {
  return can(actor, P.EMPLOYEES_MANAGE) && ASSIGNABLE_ROLES.includes(role);
}

/**
 * Change role / status / password of another account.
 * Owner accounts cannot be modified from the portal (prevents lock-out
 * and privilege tampering); use scripts/create-owner.mjs --reset instead.
 */
export function canManageAccount(actor, target) {
  if (!can(actor, P.EMPLOYEES_MANAGE)) return false;
  if (!target || target.role === ROLES.OWNER) return false;
  return idOf(actor) !== idOf(target);
}
