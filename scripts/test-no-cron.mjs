/**
 * The portal must be correct with no scheduler at all.
 *
 *   npm run dev
 *   npx tsx --test scripts/test-no-cron.mjs
 *
 * vercel.json declares no cron jobs so the site deploys on a free account with
 * nothing to configure. That is only defensible if the things a nightly job
 * would have written are computed when they are read instead. These tests hold
 * that line: absences appear without the job having run, a stale session is
 * closed by a page load, and leave carries forward from a cycle nobody rolled.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { fetchWithRetry, probeServer, signIn as httpSignIn } from './test-http.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const BASE = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';
const sessions = {};
let serverUp = false;
let db = null;

async function call(role, path, { method = 'GET', body = null } = {}) {
  const res = await fetchWithRetry(BASE + path, {
    method,
    headers: {
      ...(sessions[role] ? { cookie: sessions[role] } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

serverUp = await probeServer(BASE);
if (serverUp) {
  sessions.owner = await httpSignIn(BASE, 'DEMO-001', 'Demo@Owner2026');
  sessions.md = await httpSignIn(BASE, 'DEMO-003', 'Demo@Md2026');
  sessions.employee = await httpSignIn(BASE, 'DEMO-101', 'Demo@Ali2026');
  db = await mongoose.connect(process.env.MONGODB_URI);
}

const skip = () =>
  serverUp ? false : 'no server at ' + BASE + ' — start `npm run dev` and seed first';

const users = () => mongoose.connection.collection('workspace_users');
const attendance = () => mongoose.connection.collection('workspace_attendance');
const balances = () => mongoose.connection.collection('workspace_leave_balances');
const settingsCol = () => mongoose.connection.collection('workspace_settings');

/** A recent past date that is a working day under the seeded shift (Sun is off). */
function pastWorkingDate(tz, back) {
  let cursor = DateTime.now().setZone(tz).minus({ days: back });
  while (cursor.weekday === 7) cursor = cursor.minus({ days: 1 });
  return cursor.toISODate();
}

describe('absences appear without the marking job ever running', () => {
  test(
    'a past working day with no record reads as absent everywhere',
    { skip: skip() },
    async () => {
      if (!db) return;
      const user = await users().findOne({ employeeId: 'DEMO-101' });
      const tz = user.timezone;
      const workDate = pastWorkingDate(tz, 3);

      // No attendance row at all, and no leave: exactly the state the nightly
      // job would have written into.
      await attendance().deleteMany({ userId: user._id, workDate });
      const stored = await attendance().findOne({ userId: user._id, workDate });
      assert.equal(stored, null, 'there is deliberately no record for this day');

      const history = await call(
        'employee',
        '/api/workspace/attendance/history?from=' + workDate + '&to=' + workDate
      );
      assert.equal(history.status, 200);
      assert.equal(history.data.days[0].status, 'ABSENT', 'the employee history shows it');

      const team = await call('md', '/api/workspace/attendance/team?date=' + workDate);
      assert.equal(team.status, 200);
      const row = team.data.rows.find((r) => r.employeeId === 'DEMO-101');
      assert.equal(row.status, 'ABSENT', 'the team sheet shows it');

      const report = await call(
        'md',
        '/api/workspace/reports?key=absentees&from=' + workDate + '&to=' + workDate
      );
      assert.equal(report.status, 200);
      assert.ok(
        report.data.rows.some((r) => r.employeeId === 'DEMO-101'),
        'the absentees report lists it'
      );
    }
  );

  test('a day still running is not an absence', { skip: skip() }, async () => {
    if (!db) return;
    const user = await users().findOne({ employeeId: 'DEMO-101' });
    const today = DateTime.now().setZone(user.timezone).toISODate();
    await attendance().deleteMany({ userId: user._id, workDate: today });

    const history = await call(
      'employee',
      '/api/workspace/attendance/history?from=' + today + '&to=' + today
    );
    assert.notEqual(history.data.days[0].status, 'ABSENT', 'today is never retroactively absent');
  });
});

describe('a stale session is closed by a page load, not by a job', () => {
  test('loading the dashboard closes yesterday and flags it', { skip: skip() }, async () => {
    if (!db) return;
    const user = await users().findOne({ employeeId: 'DEMO-101' });
    const tz = user.timezone;
    const workDate = pastWorkingDate(tz, 2);

    await attendance().deleteMany({ userId: user._id, workDate });
    await mongoose.connection
      .collection('workspace_eods')
      .deleteMany({ userId: user._id, workDate });
    await attendance().insertOne({
      userId: user._id,
      workDate,
      office: user.office,
      timezone: tz,
      clockIn: DateTime.fromISO(workDate + 'T10:05', { zone: tz }).toJSDate(),
      clockOut: null,
      breaks: [],
      status: 'PRESENT',
      flags: [],
      autoClosed: false,
      eodMissing: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // No cron call anywhere — just the request an employee makes every morning.
    const today = await call('employee', '/api/workspace/attendance/today');
    assert.equal(today.status, 200);

    const closed = await attendance().findOne({ userId: user._id, workDate });
    assert.ok(closed.clockOut, 'the stale session was closed by the page load');
    assert.equal(closed.autoClosed, true);
    assert.equal(closed.eodMissing, true, 'and the report is still owed');

    // And the employee is free to clock in today rather than being stuck.
    assert.equal(today.data.canClockIn || today.data.clockedIn || today.data.clockedOut, true);

    await attendance().deleteMany({ userId: user._id, workDate });
  });
});

describe('leave carries forward from a cycle nobody rolled', () => {
  test('carry-in is computed on demand when rolledOverAt is null', { skip: skip() }, async () => {
    if (!db) return;
    // The request below is made as DEMO-101, and reading a balance is what
    // creates the row — so the fixture has to be for that same person.
    const user = await users().findOne({ employeeId: 'DEMO-101' });
    const before = await settingsCol().findOne({ key: 'COMPANY' });

    // A previous cycle with 2 unused days, never rolled by any job.
    const prevStart = DateTime.now().minus({ months: 1 }).startOf('month');
    const prevKey = prevStart.toFormat('yyyy-MM');
    const thisKey = DateTime.now().toFormat('yyyy-MM');

    try {
      await settingsCol().updateOne(
        { key: 'COMPANY' },
        { $set: { leaveCarryForward: 'CARRY', maxCarryForward: 5, monthlyLeaveQuota: 2 } }
      );

      await balances().deleteMany({ userId: user._id, cycleKey: { $in: [prevKey, thisKey] } });
      await balances().insertOne({
        userId: user._id,
        cycleKey: prevKey,
        cycleStart: prevStart.toJSDate(),
        cycleEnd: prevStart.endOf('month').toJSDate(),
        quota: 2,
        carriedIn: 0,
        used: 0,
        pending: 0,
        carriedOut: 0,
        rolledOverAt: null, // the job never ran
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Reading the balance is what creates this cycle's row.
      const leave = await call('employee', '/api/workspace/leave');
      assert.equal(leave.status, 200);

      const current = await balances().findOne({ userId: user._id, cycleKey: thisKey });
      assert.ok(current, 'this cycle got a balance row');
      assert.equal(current.carriedIn, 2, 'the 2 unused days carried in without any job');
    } finally {
      await balances().deleteMany({ userId: user._id, cycleKey: { $in: [prevKey, thisKey] } });
      await settingsCol().updateOne(
        { key: 'COMPANY' },
        {
          $set: {
            leaveCarryForward: before.leaveCarryForward,
            maxCarryForward: before.maxCarryForward,
            monthlyLeaveQuota: before.monthlyLeaveQuota,
          },
        }
      );
    }
  });

  test('LAPSE still carries nothing forward', { skip: skip() }, async () => {
    if (!db) return;
    const user = await users().findOne({ employeeId: 'DEMO-101' });
    const before = await settingsCol().findOne({ key: 'COMPANY' });

    const prevStart = DateTime.now().minus({ months: 1 }).startOf('month');
    const prevKey = prevStart.toFormat('yyyy-MM');
    const thisKey = DateTime.now().toFormat('yyyy-MM');

    try {
      await settingsCol().updateOne({ key: 'COMPANY' }, { $set: { leaveCarryForward: 'LAPSE' } });
      await balances().deleteMany({ userId: user._id, cycleKey: { $in: [prevKey, thisKey] } });
      await balances().insertOne({
        userId: user._id,
        cycleKey: prevKey,
        cycleStart: prevStart.toJSDate(),
        cycleEnd: prevStart.endOf('month').toJSDate(),
        quota: 2,
        carriedIn: 0,
        used: 0,
        pending: 0,
        carriedOut: 0,
        rolledOverAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await call('employee', '/api/workspace/leave');
      assert.equal(summary.status, 200);

      const current = await balances().findOne({ userId: user._id, cycleKey: thisKey });
      assert.ok(current, 'this cycle got a balance row');
      assert.equal(current.carriedIn, 0, 'nothing carries under LAPSE');
    } finally {
      await balances().deleteMany({ userId: user._id, cycleKey: { $in: [prevKey, thisKey] } });
      await settingsCol().updateOne(
        { key: 'COMPANY' },
        { $set: { leaveCarryForward: before.leaveCarryForward } }
      );
    }
  });
});

describe('the cron routes stay safe while unscheduled', () => {
  test('they refuse an unauthenticated call even with no schedule', { skip: skip() }, async () => {
    for (const job of ['daily', 'auto-close', 'mark-absent']) {
      const res = await fetchWithRetry(BASE + '/api/workspace/cron/' + job, { redirect: 'manual' });
      assert.ok([401, 503].includes(res.status), job + ' returned ' + res.status);
    }
  });
});

after(async () => {
  if (db) await mongoose.disconnect().catch(() => {});
});
