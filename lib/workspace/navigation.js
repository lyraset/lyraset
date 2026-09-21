import { P } from './permissions.js';

/** Sidebar items. Hiding a link is cosmetic — access is enforced by routeAccess + page guards. */
export const NAV_ITEMS = Object.freeze([
  { label: 'Dashboard', href: '/workspace', permission: null },
  { label: 'My attendance', href: '/workspace/attendance', permission: P.ATTENDANCE_SELF },
  { label: 'My EODs', href: '/workspace/eod', permission: P.EOD_SUBMIT },
  { label: 'Leave', href: '/workspace/leave', permission: P.LEAVE_REQUEST },
  { label: 'Requests', href: '/workspace/requests', permission: P.REQUEST_SUBMIT },
  { label: 'Team attendance', href: '/workspace/team', permission: P.ATTENDANCE_VIEW_ALL },
  { label: 'Team EODs', href: '/workspace/team/eod', permission: P.EOD_VIEW_ALL },
  { label: 'Leave calendar', href: '/workspace/leave-calendar', permission: P.LEAVE_CALENDAR_VIEW },
  { label: 'Reports', href: '/workspace/reports', permission: P.REPORTS_VIEW },
  { label: 'Approvals', href: '/workspace/approvals', permission: P.APPROVALS_MANAGE },
  { label: 'Employees', href: '/workspace/employees', permission: P.EMPLOYEES_MANAGE },
  { label: 'Settings', href: '/workspace/settings', permission: P.SETTINGS_MANAGE },
  { label: 'Payroll close', href: '/workspace/payroll-close', permission: P.PAYROLL_LOCK },
  { label: 'Audit log', href: '/workspace/audit', permission: P.AUDIT_VIEW },
  { label: 'My profile', href: '/workspace/profile', permission: P.PROFILE_VIEW_OWN },
]);
