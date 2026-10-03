import { P } from './permissions.js';

/**
 * Sidebar items. Hiding a link is cosmetic — access is enforced by
 * routeAccess + the page guards, so a hidden link is still a locked door.
 *
 * Items carry a `group` so the sidebar can separate what you do from what you
 * oversee from what you administer. A role that has nothing in a group simply
 * never sees that heading. `icon` names a shape in components/workspace/NavIcon.
 */
export const NAV_GROUPS = Object.freeze([
  { id: 'self', label: 'My work' },
  { id: 'oversight', label: 'Team' },
  { id: 'admin', label: 'Administration' },
]);

export const NAV_ITEMS = Object.freeze([
  { label: 'Dashboard', href: '/workspace', permission: null, group: 'self', icon: 'dashboard' },
  {
    label: 'My attendance',
    href: '/workspace/attendance',
    permission: P.ATTENDANCE_SELF,
    group: 'self',
    icon: 'clock',
  },
  {
    label: 'My EODs',
    href: '/workspace/eod',
    permission: P.EOD_SUBMIT,
    group: 'self',
    icon: 'report',
  },
  {
    label: 'Leave',
    href: '/workspace/leave',
    permission: P.LEAVE_REQUEST,
    group: 'self',
    icon: 'calendar',
  },
  {
    label: 'Requests',
    href: '/workspace/requests',
    permission: P.REQUEST_SUBMIT,
    group: 'self',
    icon: 'inbox',
  },
  {
    label: 'My profile',
    href: '/workspace/profile',
    permission: P.PROFILE_VIEW_OWN,
    group: 'self',
    icon: 'user',
  },

  {
    label: 'Team attendance',
    href: '/workspace/team',
    permission: P.ATTENDANCE_VIEW_ALL,
    group: 'oversight',
    icon: 'users',
  },
  {
    label: 'Team EODs',
    href: '/workspace/team/eod',
    permission: P.EOD_VIEW_ALL,
    group: 'oversight',
    icon: 'clipboard',
  },
  {
    label: 'Leave calendar',
    href: '/workspace/leave-calendar',
    permission: P.LEAVE_CALENDAR_VIEW,
    group: 'oversight',
    icon: 'calendarDays',
  },
  {
    label: 'Reports',
    href: '/workspace/reports',
    permission: P.REPORTS_VIEW,
    group: 'oversight',
    icon: 'chart',
  },
  {
    label: 'Approvals',
    href: '/workspace/approvals',
    permission: P.APPROVALS_MANAGE,
    group: 'oversight',
    icon: 'check',
  },

  {
    label: 'Employees',
    href: '/workspace/employees',
    permission: P.EMPLOYEES_MANAGE,
    group: 'admin',
    icon: 'idCard',
  },
  {
    label: 'Settings',
    href: '/workspace/settings',
    permission: P.SETTINGS_MANAGE,
    group: 'admin',
    icon: 'sliders',
  },
  {
    label: 'Payroll close',
    href: '/workspace/payroll-close',
    permission: P.PAYROLL_LOCK,
    group: 'admin',
    icon: 'lock',
  },
  {
    label: 'Audit log',
    href: '/workspace/audit',
    permission: P.AUDIT_VIEW,
    group: 'admin',
    icon: 'ledger',
  },
]);
