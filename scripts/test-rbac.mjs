/**
 * RBAC regression tests — no database needed.
 *   npx tsx --test scripts/test-rbac.mjs
 * The expected matrix below is written independently of permissions.js on purpose:
 * if someone edits ROLE_PERMISSIONS by mistake, these tests fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  P,
  getPermissions,
  can,
  canApprove,
  canAssignRole,
  canManageAccount,
} from '../lib/workspace/permissions.js';
import { resolveAccess, isPathAllowed } from '../lib/workspace/routeAccess.js';
import { NAV_ITEMS } from '../lib/workspace/navigation.js';

const owner = { id: 'u-owner', role: ROLES.OWNER, requiresAttendance: true };
const ceo = { id: 'u-ceo', role: ROLES.CEO, requiresAttendance: false };
const md = { id: 'u-md', role: ROLES.MD, requiresAttendance: true };
const emp1 = { id: 'u-e1', role: ROLES.EMPLOYEE, requiresAttendance: true };
const emp2 = { id: 'u-e2', role: ROLES.EMPLOYEE, requiresAttendance: true };

const EXPECTED = {
  EMPLOYEE: [
    'profile:view_own',
    'attendance:self',
    'eod:submit',
    'leave:request',
    'request:submit',
  ],
  MD: [
    'profile:view_own',
    'attendance:self',
    'eod:submit',
    'leave:request',
    'request:submit',
    'live_board:view',
    'attendance:view_all',
    'eod:view_all',
    'leave_calendar:view',
    'reports:view',
    'reports:export',
  ],
  OWNER: [
    'profile:view_own',
    'attendance:self',
    'eod:submit',
    'leave:request',
    'request:submit',
    'live_board:view',
    'attendance:view_all',
    'eod:view_all',
    'leave_calendar:view',
    'reports:view',
    'reports:export',
    'approvals:manage',
    'attendance:edit',
    'employees:manage',
    'settings:manage',
    'payroll:lock',
    'audit:view',
  ],
  CEO: [
    'profile:view_own',
    'live_board:view',
    'attendance:view_all',
    'eod:view_all',
    'leave_calendar:view',
    'reports:view',
    'reports:export',
    'approvals:manage',
    'audit:view',
  ],
};

test('each role has exactly the expected permissions', () => {
  for (const user of [owner, ceo, md, emp1]) {
    assert.deepEqual([...getPermissions(user)].sort(), [...EXPECTED[user.role]].sort(), user.role);
  }
});

test('CEO never clocks in, submits EODs or applies for leave — even if the flag is flipped', () => {
  for (const u of [ceo, { ...ceo, requiresAttendance: true }]) {
    assert.equal(can(u, P.ATTENDANCE_SELF), false);
    assert.equal(can(u, P.EOD_SUBMIT), false);
    assert.equal(can(u, P.LEAVE_REQUEST), false);
  }
});

test("MD, Owner and CEO can view everyone's attendance and EODs; employees can't", () => {
  for (const u of [md, owner, ceo]) {
    assert.ok(can(u, P.ATTENDANCE_VIEW_ALL));
    assert.ok(can(u, P.EOD_VIEW_ALL));
  }
  assert.equal(can(emp1, P.ATTENDANCE_VIEW_ALL), false);
  assert.equal(can(emp1, P.EOD_VIEW_ALL), false);
});

test('MD cannot edit records, approve, manage employees, settings or payroll', () => {
  for (const perm of [
    P.ATTENDANCE_EDIT,
    P.APPROVALS_MANAGE,
    P.EMPLOYEES_MANAGE,
    P.SETTINGS_MANAGE,
    P.PAYROLL_LOCK,
    P.AUDIT_VIEW,
  ]) {
    assert.equal(can(md, perm), false, perm);
  }
});

test('only the Owner creates credentials and changes settings', () => {
  for (const u of [ceo, md, emp1]) {
    assert.equal(can(u, P.EMPLOYEES_MANAGE), false, u.role);
    assert.equal(can(u, P.SETTINGS_MANAGE), false, u.role);
  }
  assert.ok(can(owner, P.EMPLOYEES_MANAGE));
  assert.ok(can(owner, P.SETTINGS_MANAGE));
});

test("approval rules: no self-approval, Owner's requests go to the CEO", () => {
  assert.ok(canApprove(owner, emp1));
  assert.ok(canApprove(ceo, emp1));
  assert.ok(canApprove(owner, md));
  assert.ok(canApprove(ceo, owner));
  assert.equal(canApprove(owner, owner), false);
  assert.equal(canApprove(md, emp1), false);
  assert.equal(canApprove(emp1, emp2), false);
  assert.equal(canApprove(owner, {}), false);
});

test('role assignment: Owner can assign Employee/MD/CEO but never Owner', () => {
  assert.ok(canAssignRole(owner, ROLES.EMPLOYEE));
  assert.ok(canAssignRole(owner, ROLES.MD));
  assert.ok(canAssignRole(owner, ROLES.CEO));
  assert.equal(canAssignRole(owner, ROLES.OWNER), false);
  assert.equal(canAssignRole(ceo, ROLES.EMPLOYEE), false);
  assert.equal(canAssignRole(md, ROLES.EMPLOYEE), false);
});

test('account management: Owner manages others, never an Owner account', () => {
  assert.ok(canManageAccount(owner, emp1));
  assert.ok(canManageAccount(owner, ceo));
  assert.equal(canManageAccount(owner, owner), false);
  assert.equal(canManageAccount(ceo, emp1), false);
});

test('exempting an employee strips self-service attendance permissions only', () => {
  const exempt = { ...emp1, requiresAttendance: false };
  assert.equal(can(exempt, P.ATTENDANCE_SELF), false);
  assert.ok(can(exempt, P.PROFILE_VIEW_OWN));
});

test('unknown or missing role gets nothing', () => {
  assert.equal(getPermissions({ role: 'ADMIN' }).size, 0);
  assert.equal(getPermissions(null).size, 0);
});

test('route resolution is segment-aware and deny-by-default', () => {
  assert.deepEqual(resolveAccess('/workspace/login'), { type: 'public' });
  assert.deepEqual(resolveAccess('/api/workspace/auth/login'), { type: 'public' });
  assert.deepEqual(resolveAccess('/api/workspace/employees'), { type: 'auth' });
  assert.deepEqual(resolveAccess('/workspace'), { type: 'auth' });
  assert.deepEqual(resolveAccess('/workspace/'), { type: 'auth' });
  assert.equal(resolveAccess('/workspace/leave-calendar').permission, P.LEAVE_CALENDAR_VIEW);
  assert.equal(resolveAccess('/workspace/leave/apply').permission, P.LEAVE_REQUEST);
  assert.equal(resolveAccess('/workspace/team/eod').permission, P.EOD_VIEW_ALL);
  assert.equal(resolveAccess('/workspace/team/65f0abc').permission, P.ATTENDANCE_VIEW_ALL);
  assert.equal(resolveAccess('/workspace/teamx').type, 'deny');
  assert.equal(resolveAccess('/workspace/unknown-page').type, 'deny');
});

test('page access matrix for every role', () => {
  // path: [EMPLOYEE, MD, OWNER, CEO]
  const MATRIX = {
    '/workspace': [1, 1, 1, 1],
    '/workspace/profile': [1, 1, 1, 1],
    '/workspace/attendance': [1, 1, 1, 0],
    '/workspace/eod': [1, 1, 1, 0],
    '/workspace/leave': [1, 1, 1, 0],
    '/workspace/requests': [1, 1, 1, 0],
    '/workspace/team': [0, 1, 1, 1],
    '/workspace/team/eod': [0, 1, 1, 1],
    '/workspace/leave-calendar': [0, 1, 1, 1],
    '/workspace/reports': [0, 1, 1, 1],
    '/workspace/approvals': [0, 0, 1, 1],
    '/workspace/audit': [0, 0, 1, 1],
    '/workspace/employees': [0, 0, 1, 0],
    '/workspace/settings/shifts': [0, 0, 1, 0],
    '/workspace/payroll-close': [0, 0, 1, 0],
    '/workspace/not-a-page': [0, 0, 0, 0],
  };
  const users = [emp1, md, owner, ceo];
  for (const [path, expected] of Object.entries(MATRIX)) {
    users.forEach((u, i) => {
      assert.equal(isPathAllowed(u, path), Boolean(expected[i]), `${u.role} -> ${path}`);
    });
  }
  assert.equal(isPathAllowed(null, '/workspace'), false);
  assert.equal(isPathAllowed(null, '/workspace/login'), true);
});

test('every sidebar link is guarded by the same permission as its route', () => {
  for (const item of NAV_ITEMS) {
    const access = resolveAccess(item.href);
    if (item.permission === null) assert.equal(access.type, 'auth', item.href);
    else assert.equal(access.permission, item.permission, item.href);
  }
});
