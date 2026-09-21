/**
 * End-to-end flow tests — these need a running server and a seeded database.
 *
 *   npm run dev
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --with-history
 *   npx tsx --test scripts/test-flows.mjs
 *
 * These walk the paths a person actually takes: clocking in, taking a break,
 * clocking out through the EOD dialog, applying for leave against a quota, and
 * locking a period. They write to the database, so each test clears its own
 * ground first and the suite is re-runnable.
 *
 * Point them at a development database. They skip entirely if no server is up.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';

dotenv.config({ path: '.env.local' });
dotenv.config();

const BASE = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';

const sessions = {};
let serverUp = false;
let db = null;

async function signIn(identifier, password) {
  const res = await fetch(BASE + '/api/workspace/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error('sign-in failed for ' + identifier + ': ' + res.status);
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('lyr_ws_session='));
  return cookie.split(';')[0];
}

async function call(role, path, { method = 'GET', body = null } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(sessions[role] ? { cookie: sessions[role] } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

try {
  const probe = await fetch(BASE + '/api/workspace/auth/me', { redirect: 'manual' });
  serverUp = probe.status === 401 || probe.ok;
} catch {
  serverUp = false;
}

if (serverUp) {
  sessions.owner = await signIn('DEMO-001', 'Demo@Owner2026');
  sessions.ceo = await signIn('DEMO-002', 'Demo@Ceo2026');
  sessions.md = await signIn('DEMO-003', 'Demo@Md2026');
  sessions.employee = await signIn('DEMO-101', 'Demo@Ali2026');
  db = await mongoose.connect(process.env.MONGODB_URI);
}

const skip = () =>
  serverUp ? false : 'no server at ' + BASE + ' — start `npm run dev` and seed first';

/** Clear today's attendance and EOD for one employee, so a flow can re-run. */
async function resetToday(employeeId) {
  if (!db) return null;
  const users = mongoose.connection.collection('workspace_users');
  const user = await users.findOne({ employeeId });
  if (!user) return null;
  const workDate = DateTime.now()
    .setZone(user.timezone || 'Asia/Karachi')
    .toISODate();
  await mongoose.connection
    .collection('workspace_attendance')
    .deleteMany({ userId: user._id, workDate });
  await mongoose.connection.collection('workspace_eods').deleteMany({ userId: user._id, workDate });
  return { user, workDate };
}

describe('the clock-in to EOD flow', () => {
  test(
    'an employee clocks in, breaks, and clocks out only through the EOD',
    { skip: skip() },
    async () => {
      await resetToday('DEMO-101');

      // --- clock in -----------------------------------------------------------
      const clockIn = await call('employee', '/api/workspace/attendance/clock-in', {
        method: 'POST',
        body: {},
      });
      assert.equal(clockIn.status, 201, JSON.stringify(clockIn.data));
      assert.ok(clockIn.data.record.clockIn, 'the server stamped a clock-in time');

      // A double tap must not create a second record or a second clock-in.
      const again = await call('employee', '/api/workspace/attendance/clock-in', {
        method: 'POST',
        body: {},
      });
      assert.equal(again.status, 409, 'a second clock-in is refused');

      // --- breaks -------------------------------------------------------------
      const startBreak = await call('employee', '/api/workspace/attendance/break', {
        method: 'POST',
        body: { action: 'START', type: 'LUNCH' },
      });
      assert.equal(startBreak.status, 200, JSON.stringify(startBreak.data));
      assert.equal(startBreak.data.record.breaks.length, 1);

      const doubleBreak = await call('employee', '/api/workspace/attendance/break', {
        method: 'POST',
        body: { action: 'START', type: 'PRAYER' },
      });
      assert.equal(doubleBreak.status, 409, 'two open breaks are impossible');

      const endBreak = await call('employee', '/api/workspace/attendance/break', {
        method: 'POST',
        body: { action: 'END' },
      });
      assert.equal(endBreak.status, 200);
      assert.ok(endBreak.data.record.breaks[0].end, 'the break was closed');

      const endAgain = await call('employee', '/api/workspace/attendance/break', {
        method: 'POST',
        body: { action: 'END' },
      });
      assert.equal(endAgain.status, 409, 'ending a break twice is refused');

      // --- the EOD gate -------------------------------------------------------
      const noTasks = await call('employee', '/api/workspace/attendance/clock-out', {
        method: 'POST',
        body: { tasks: [] },
      });
      assert.equal(noTasks.status, 400, 'clocking out with no EOD tasks is refused');

      const stillIn = await call('employee', '/api/workspace/attendance/today');
      assert.equal(
        stillIn.data.clockedIn,
        true,
        'a refused clock-out leaves the employee clocked in'
      );

      const tooShort = await call('employee', '/api/workspace/attendance/clock-out', {
        method: 'POST',
        body: { tasks: [{ title: 'Something', description: 'short' }] },
      });
      assert.equal(tooShort.status, 400, 'the minimum description length is enforced server-side');

      // --- EOD and clock-out together ----------------------------------------
      const clockOut = await call('employee', '/api/workspace/attendance/clock-out', {
        method: 'POST',
        body: {
          tasks: [
            {
              title: 'Homepage hero rebuild',
              description: 'Rebuilt the hero section and pushed it for review by the design team.',
              minutes: 240,
              status: 'COMPLETED',
            },
          ],
          tomorrowPlan: 'Pick up the review comments.',
        },
      });
      assert.equal(clockOut.status, 201, JSON.stringify(clockOut.data));
      assert.ok(clockOut.data.record.clockOut, 'the clock-out was stamped on submission');
      assert.ok(clockOut.data.eodId, 'the EOD was created in the same call');

      const outAgain = await call('employee', '/api/workspace/attendance/clock-out', {
        method: 'POST',
        body: {
          tasks: [
            { title: 'Duplicate', description: 'This should not be accepted a second time.' },
          ],
        },
      });
      assert.equal(outAgain.status, 409, 'a second clock-out is refused');

      // --- it shows up in history --------------------------------------------
      const history = await call('employee', '/api/workspace/eod');
      assert.equal(history.status, 200);
      const today = history.data.eods.find((e) => e.id === clockOut.data.eodId);
      assert.ok(today, 'the EOD appears in the employee history');
      assert.equal(today.tasks.length, 1);

      await resetToday('DEMO-101');
    }
  );

  test('the CEO cannot clock in at all', { skip: skip() }, async () => {
    const res = await call('ceo', '/api/workspace/attendance/clock-in', {
      method: 'POST',
      body: {},
    });
    assert.equal(res.status, 403);
  });
});

describe('leave against the quota', () => {
  test('a quote prices the request before it is submitted', { skip: skip() }, async () => {
    const types = await call('owner', '/api/workspace/settings/leave-types');
    const casual = types.data.leaveTypes.find((t) => t.code === 'CL');

    // Two working days, a fortnight out so notice rules cannot bite.
    const from = nextWorkingDate(14);
    const to = nextWorkingDate(15);

    const quote = await call('employee', '/api/workspace/leave/quote', {
      method: 'POST',
      body: { leaveTypeId: casual.id, from, to },
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.data));
    assert.ok(quote.data.days > 0, 'the quote counts working days');
    assert.ok(Array.isArray(quote.data.splits) && quote.data.splits.length >= 1);
    assert.equal(typeof quote.data.blocked, 'boolean');
  });

  test(
    'a request beyond the quota is converted to unpaid, per the setting',
    { skip: skip() },
    async () => {
      const types = await call('owner', '/api/workspace/settings/leave-types');
      const casual = types.data.leaveTypes.find((t) => t.code === 'CL');

      // The seeded quota is 2 paid days a cycle; ask for five.
      const from = nextWorkingDate(20);
      const to = nextWorkingDate(26);
      const quote = await call('employee', '/api/workspace/leave/quote', {
        method: 'POST',
        body: { leaveTypeId: casual.id, from, to },
      });
      assert.equal(quote.status, 200);
      assert.ok(quote.data.unpaidDays > 0, 'days beyond the quota become unpaid');
      assert.equal(quote.data.blocked, false, 'CONVERT_TO_UNPAID does not block');
    }
  );

  test('nobody approves their own leave', { skip: skip() }, async () => {
    const pending = await call('owner', '/api/workspace/approvals');
    assert.equal(pending.status, 200);
    // The Owner's own requests are never in the Owner's inbox.
    const me = await call('owner', '/api/workspace/auth/me');
    const ownerId = me.data.user.id;
    const own = pending.data.leaves.filter((l) => l.userId === ownerId);
    assert.equal(own.length, 0, "the Owner's own leave never appears in their own inbox");
  });
});

describe('a locked period is read-only for everyone', () => {
  test('locking blocks writes, and unlocking needs a reason', { skip: skip() }, async () => {
    const reset = await resetToday('DEMO-101');
    if (!reset) return;

    // Lock the cycle before last, which is safely finished.
    const cycleKey = DateTime.now().minus({ months: 2 }).toFormat('yyyy-MM');
    await mongoose.connection
      .collection('workspace_payroll_periods')
      .deleteMany({ office: 'ISLAMABAD', cycleKey });

    const lock = await call('owner', '/api/workspace/payroll', {
      method: 'POST',
      body: { action: 'LOCK', office: 'ISLAMABAD', cycleKey },
    });
    assert.equal(lock.status, 200, JSON.stringify(lock.data));
    assert.equal(lock.data.period.status, 'LOCKED');

    // Even the Owner cannot edit a day inside it.
    const workDate = DateTime.fromISO(cycleKey + '-15').toISODate();
    const edit = await call('owner', '/api/workspace/attendance/day', {
      method: 'PATCH',
      body: {
        userId: reset.user._id.toString(),
        workDate,
        clockIn: '10:00',
        reason: 'testing that a locked period refuses edits',
      },
    });
    assert.equal(edit.status, 423, 'a locked period refuses edits, Owner included');

    const noReason = await call('owner', '/api/workspace/payroll', {
      method: 'POST',
      body: { action: 'UNLOCK', office: 'ISLAMABAD', cycleKey },
    });
    assert.equal(noReason.status, 400, 'unlocking without a reason is refused');

    const unlock = await call('owner', '/api/workspace/payroll', {
      method: 'POST',
      body: {
        action: 'UNLOCK',
        office: 'ISLAMABAD',
        cycleKey,
        reason: 'Reopening to fix a correction.',
      },
    });
    assert.equal(unlock.status, 200);
    assert.equal(unlock.data.period.status, 'OPEN');
    assert.equal(unlock.data.period.unlockHistory.length, 1, 'the unlock reason is kept');

    await mongoose.connection
      .collection('workspace_payroll_periods')
      .deleteMany({ office: 'ISLAMABAD', cycleKey });
  });
});

describe('Owner account management', () => {
  test(
    'a generated password is shown once and signs the account out',
    { skip: skip() },
    async () => {
      const list = await call('owner', '/api/workspace/employees');
      const target = list.data.users.find((u) => u.employeeId === 'DEMO-104');

      const reset = await call('owner', '/api/workspace/employees/' + target.id + '/password', {
        method: 'POST',
        body: {},
      });
      assert.equal(reset.status, 200);
      assert.ok(reset.data.password, 'the new password comes back exactly once');
      assert.equal(reset.data.signedOut, true);

      // The old password no longer works.
      const oldLogin = await fetch(BASE + '/api/workspace/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'DEMO-104', password: 'Demo@Mahnoor2026' }),
      });
      assert.equal(oldLogin.status, 401);

      // The new one does.
      const newLogin = await fetch(BASE + '/api/workspace/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'DEMO-104', password: reset.data.password }),
      });
      assert.equal(newLogin.status, 200);
    }
  );

  test('the Owner account cannot be managed through the portal', { skip: skip() }, async () => {
    const me = await call('owner', '/api/workspace/auth/me');
    const ownerId = me.data.user.id;

    const reset = await call('owner', '/api/workspace/employees/' + ownerId + '/password', {
      method: 'POST',
      body: {},
    });
    assert.equal(reset.status, 403, 'even the Owner cannot reset the Owner from the portal');

    const deactivate = await call('owner', '/api/workspace/employees/' + ownerId + '/status', {
      method: 'POST',
      body: { status: 'INACTIVE' },
    });
    assert.equal(deactivate.status, 403, 'the Owner cannot lock themselves out');
  });

  test('a new employee is created with a password shown once', { skip: skip() }, async () => {
    await mongoose.connection.collection('workspace_users').deleteMany({ employeeId: 'TEST-901' });

    const created = await call('owner', '/api/workspace/employees', {
      method: 'POST',
      body: {
        employeeId: 'TEST-901',
        name: 'Test Employee',
        email: 'test901@lyraset.test',
        role: 'EMPLOYEE',
        office: 'ISLAMABAD',
        workMode: 'OFFICE',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.ok(created.data.generatedPassword, 'a password was generated and returned once');
    assert.equal(created.data.user.passwordHash, undefined, 'the hash never leaves the server');

    // That password works immediately.
    const login = await fetch(BASE + '/api/workspace/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'TEST-901', password: created.data.generatedPassword }),
    });
    assert.equal(login.status, 200);

    // A duplicate Employee ID is refused rather than silently overwriting.
    const duplicate = await call('owner', '/api/workspace/employees', {
      method: 'POST',
      body: {
        employeeId: 'TEST-901',
        name: 'Another Person',
        email: 'test902@lyraset.test',
        role: 'EMPLOYEE',
      },
    });
    assert.equal(duplicate.status, 409);

    await mongoose.connection.collection('workspace_users').deleteMany({ employeeId: 'TEST-901' });
  });

  test('the OWNER role can never be assigned from the portal', { skip: skip() }, async () => {
    const res = await call('owner', '/api/workspace/employees', {
      method: 'POST',
      body: {
        employeeId: 'TEST-902',
        name: 'Would Be Owner',
        email: 'test902@lyraset.test',
        role: 'OWNER',
      },
    });
    assert.equal(res.status, 400, 'OWNER is not an assignable role, so it fails validation');
  });
});

describe('the company month drives the cycle', () => {
  test('reports and dashboards use the configured cycle window', { skip: skip() }, async () => {
    const settings = await call('owner', '/api/workspace/settings/company');
    assert.equal(settings.status, 200);
    const { currentCycle, cycleStartDay } = settings.data;
    assert.ok(currentCycle.startDate && currentCycle.endDate);

    const expectedStartDay = Number(currentCycle.startDate.slice(8));
    assert.equal(expectedStartDay, cycleStartDay, 'the cycle starts on the configured day');

    const history = await call('employee', '/api/workspace/attendance/history');
    assert.equal(
      history.data.from,
      currentCycle.startDate,
      'history defaults to the current cycle'
    );
    assert.equal(history.data.to, currentCycle.endDate);
  });
});

/** The Nth day from today that is not a Sunday, as YYYY-MM-DD. */
function nextWorkingDate(offsetDays) {
  let cursor = DateTime.now().setZone('Asia/Karachi').plus({ days: offsetDays });
  while (cursor.weekday === 7) cursor = cursor.plus({ days: 1 });
  return cursor.toISODate();
}

// Close the connection explicitly: an open Mongoose socket keeps the test
// process alive long after the assertions have finished.
after(async () => {
  if (db) await mongoose.disconnect().catch(() => {});
});
