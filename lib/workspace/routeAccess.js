/**
 * Route -> permission map for /workspace pages. Edge-safe (used by middleware).
 * Deny-by-default: a new page is unreachable until it is listed here.
 * API routes only require a valid session at this layer — each handler
 * enforces its own permission (GET and POST on one route often differ).
 */
import { P, can } from './permissions.js';

const PUBLIC_PATHS = new Set(['/workspace/login', '/api/workspace/auth/login']);
const AUTH_ONLY_PATHS = new Set(['/workspace']); // dashboard adapts to role

// Most specific first; first match wins.
export const PAGE_RULES = Object.freeze([
  { prefix: '/workspace/team/eod', permission: P.EOD_VIEW_ALL },
  { prefix: '/workspace/team', permission: P.ATTENDANCE_VIEW_ALL },
  { prefix: '/workspace/leave-calendar', permission: P.LEAVE_CALENDAR_VIEW },
  { prefix: '/workspace/reports', permission: P.REPORTS_VIEW },
  { prefix: '/workspace/approvals', permission: P.APPROVALS_MANAGE },
  { prefix: '/workspace/employees', permission: P.EMPLOYEES_MANAGE },
  { prefix: '/workspace/settings', permission: P.SETTINGS_MANAGE },
  { prefix: '/workspace/payroll-close', permission: P.PAYROLL_LOCK },
  { prefix: '/workspace/audit', permission: P.AUDIT_VIEW },
  { prefix: '/workspace/attendance', permission: P.ATTENDANCE_SELF },
  { prefix: '/workspace/eod', permission: P.EOD_SUBMIT },
  { prefix: '/workspace/leave', permission: P.LEAVE_REQUEST },
  { prefix: '/workspace/requests', permission: P.REQUEST_SUBMIT },
  { prefix: '/workspace/profile', permission: P.PROFILE_VIEW_OWN },
]);

function normalize(pathname) {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

// Segment-aware: "/workspace/leave" must not match "/workspace/leave-calendar".
function matches(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function resolveAccess(rawPathname) {
  const pathname = normalize(rawPathname);
  if (PUBLIC_PATHS.has(pathname)) return { type: 'public' };
  if (matches(pathname, '/api/workspace')) return { type: 'auth' };
  if (AUTH_ONLY_PATHS.has(pathname)) return { type: 'auth' };
  const rule = PAGE_RULES.find((r) => matches(pathname, r.prefix));
  if (rule) return { type: 'permission', permission: rule.permission };
  return { type: 'deny' };
}

/** session: { role, requiresAttendance } or null */
export function isPathAllowed(session, pathname) {
  const access = resolveAccess(pathname);
  switch (access.type) {
    case 'public':
      return true;
    case 'auth':
      return Boolean(session);
    case 'permission':
      return Boolean(session) && can(session, access.permission);
    default:
      return false;
  }
}
