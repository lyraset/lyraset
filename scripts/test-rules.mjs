/**
 * The spec's rule-based acceptance criteria, checked end to end.
 *
 *   npm run dev
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --with-history
 *   npx tsx --test scripts/test-rules.mjs
 *
 * These are the criteria that are about behaviour rather than permissions: the
 * auto clock-out, the company month window, Dubai being measured in Dubai time,
 * and the Friday and Saturday shift lengths. They run against a live server and
 * a real database, so they catch anything the pure unit tests cannot — a rule
 * that is right in the calculation but wired up wrongly.
 *
 * Point them at a development database. They skip entirely if no server is up.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, probeServer, signIn as httpSignIn } from './test-http.mjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { getScheduleForDay } from '../lib/workspace/calc/schedule.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const BASE = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';
const sessions = {};
let serverUp = false;
let db = null;

const signIn = (identifier, password) => httpSignIn(BASE, identifier, password);

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
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

serverUp = await probeServer(BASE);

if (serverUp) {
  sessions.owner = await signIn('DEMO-001', 'Demo@Owner2026');
  sessions.md = await signIn('DEMO-003', 'Demo@Md2026');
  sessions.employee = await signIn('DEMO-101', 'Demo@Ali2026');
  db = await mongoose.connect(process.env.MONGODB_URI);
}

const skip = () =>
  serverUp ? false : 'no server at ' + BASE + ' — start `npm run dev` and seed first';

async function findUser(employeeId) {
  return mongoose.connection.collection('workspace_users').findOne({ employeeId });
}

describe('auto clock-out closes a session that was left open', () => {
  test(
    'the day is flagged, the cron is idempotent, and a late EOD still lands',
    { skip: skip() },
    async () => {
      const secret = process.env.CRON_SECRET;
      if (!secret || !db) return;

      const user = await findUser('DEMO-101');
      const tz = user.timezone || 'Asia/Karachi';
      // Two days back, so the shift has certainly ended and the offset has passed.
      const workDate = DateTime.now().setZone(tz).minus({ days: 2 }).toISODate();

      const attendance = mongoose.connection.collection('workspace_attendance');
      const eods = mongoose.connection.collection('workspace_eods');
      await attendance.deleteMany({ userId: user._id, workDate });
      await eods.deleteMany({ userId: user._id, workDate });

      // An open session: clocked in, never clocked out.
      await attendance.insertOne({
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

      const cron = await fetchWithRetry(BASE + '/api/workspace/cron/auto-close', {
        headers: { authorization: 'Bearer ' + secret },
      });
      assert.equal(cron.status, 200);

      const closed = await attendance.findOne({ userId: user._id, workDate });
      assert.ok(closed.clockOut, 'the session was closed');
      assert.equal(closed.autoClosed, true, 'and flagged as automatic');
      assert.equal(closed.status, 'MISSING_CLOCK_OUT');
      assert.equal(closed.eodMissing, true, 'the report is still owed');

      // Closed at the deadline, not at "now" — the employee did not work the
      // hours between the shift ending and the cron noticing.
      assert.equal(
        DateTime.fromJSDate(closed.clockOut, { zone: tz }).toISODate(),
        workDate,
        'closed on the same work date'
      );

      // Re-running the job changes nothing: it has to be safe to fire late.
      const rerun = await fetchWithRetry(BASE + '/api/workspace/cron/auto-close', {
        headers: { authorization: 'Bearer ' + secret },
      });
      assert.equal(rerun.status, 200);
      const after = await attendance.findOne({ userId: user._id, workDate });
      assert.equal(
        after.clockOut.getTime(),
        closed.clockOut.getTime(),
        'a second run does not move the clock-out'
      );

      // The employee can still account for the day.
      const late = await call('employee', '/api/workspace/eod', {
        method: 'POST',
        body: {
          workDate,
          tasks: [
            {
              title: 'Catching up the record',
              description: 'Submitting the report for a day that was closed automatically.',
            },
          ],
        },
      });
      assert.equal(late.status, 201, JSON.stringify(late.data));
      assert.equal(late.data.eod.lateSubmission, true, 'and it is marked as a late submission');

      const settled = await attendance.findOne({ userId: user._id, workDate });
      assert.equal(settled.eodMissing, false, 'the day no longer owes a report');

      await attendance.deleteMany({ userId: user._id, workDate });
      await eods.deleteMany({ userId: user._id, workDate });
    }
  );
});

describe('a company month start day of 26 runs from the 26th to the 25th', () => {
  test('dashboards, history and reports all use that window', { skip: skip() }, async () => {
    if (!db) return;
    const settings = mongoose.connection.collection('workspace_settings');
    const before = await settings.findOne({ key: 'COMPANY' });

    try {
      // Effective well in the past, so the current cycle already uses it.
      await settings.updateOne(
        { key: 'COMPANY' },
        {
          $set: {
            cycleStartHistory: [{ day: 26, effectiveFrom: new Date('2020-01-01T00:00:00Z') }],
          },
        }
      );

      const company = await call('owner', '/api/workspace/settings/company');
      assert.equal(company.status, 200);
      assert.equal(company.data.cycleStartDay, 26);
      assert.equal(
        company.data.currentCycle.startDate.slice(8),
        '26',
        'the cycle starts on the 26th'
      );
      assert.equal(company.data.currentCycle.endDate.slice(8), '25', 'and ends on the 25th');

      // The employee's history defaults to the same window.
      const history = await call('employee', '/api/workspace/attendance/history');
      assert.equal(history.data.from.slice(8), '26');
      assert.equal(history.data.to.slice(8), '25');

      // And so does a report run without an explicit range.
      const report = await call('md', '/api/workspace/reports?key=late');
      assert.equal(report.status, 200);
      assert.equal(report.data.window.from.slice(8), '26');
      assert.equal(report.data.window.to.slice(8), '25');
    } finally {
      await settings.updateOne(
        { key: 'COMPANY' },
        { $set: { cycleStartHistory: before.cycleStartHistory } }
      );
    }
  });
});

describe('Dubai is measured in Dubai time', () => {
  test(
    'the timezone follows the office, and the team sheet mixes both',
    { skip: skip() },
    async () => {
      const list = await call('owner', '/api/workspace/employees');
      const mahnoor = list.data.users.find((u) => u.employeeId === 'DEMO-104');
      const ali = list.data.users.find((u) => u.employeeId === 'DEMO-101');

      assert.equal(mahnoor.office, 'DUBAI');
      assert.equal(mahnoor.timezone, 'Asia/Dubai', 'the timezone is derived from the office');
      assert.equal(ali.timezone, 'Asia/Karachi');

      // Each row on the sheet is computed in its own zone, so the two offices are
      // directly comparable even though 10:00 is a different instant for each.
      const team = await call('md', '/api/workspace/attendance/team');
      assert.equal(team.status, 200);
      const dubaiRow = team.data.rows.find((r) => r.employeeId === 'DEMO-104');
      assert.ok(dubaiRow, 'the Dubai employee is on the sheet');
      assert.equal(dubaiRow.timezone, 'Asia/Dubai');
    }
  );
});

describe('the seeded shift matches the spec', () => {
  test('Friday needs 6.5 hours and a short Saturday is a full day', { skip: skip() }, async () => {
    const shifts = await call('owner', '/api/workspace/settings/shifts');
    const standard = shifts.data.shifts.find((s) => s.name === 'Standard');
    assert.ok(standard, 'the seeded standard shift exists');

    assert.deepEqual(
      [standard.days.fri.start, standard.days.fri.end, standard.days.fri.breakMinutes],
      ['10:00', '18:00', 90]
    );
    assert.deepEqual(
      [standard.days.sat.start, standard.days.sat.end, standard.days.sat.breakMinutes],
      ['10:00', '14:00', 0]
    );
    assert.equal(standard.days.sun.working, false);

    // 8 hours less the 90-minute Jummah break is 6.5 hours; Saturday needs 4.
    const user = { id: 'x', office: 'ISLAMABAD', timezone: 'Asia/Karachi', shiftId: standard.id };
    const shift = { ...standard, _id: standard.id };

    assert.equal(
      getScheduleForDay({ user, date: '2026-09-25', shifts: [shift] }).requiredMinutes,
      390
    );
    assert.equal(
      getScheduleForDay({ user, date: '2026-09-26', shifts: [shift] }).requiredMinutes,
      240
    );
    assert.equal(
      getScheduleForDay({ user, date: '2026-09-21', shifts: [shift] }).requiredMinutes,
      480
    );
  });
});

describe('absence marking only touches days that deserve it', () => {
  test(
    'a working day with no clock-in becomes absent; a weekend does not',
    { skip: skip() },
    async () => {
      const secret = process.env.CRON_SECRET;
      if (!secret || !db) return;

      const res = await fetchWithRetry(BASE + '/api/workspace/cron/mark-absent', {
        headers: { authorization: 'Bearer ' + secret },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(typeof body.marked, 'number');

      // Nobody exempt from attendance is ever marked absent.
      const ceo = await findUser('DEMO-002');
      const marked = await mongoose.connection
        .collection('workspace_attendance')
        .countDocuments({ userId: ceo._id, status: 'ABSENT' });
      assert.equal(marked, 0, 'the CEO is never marked absent');
    }
  );
});

after(async () => {
  if (db) await mongoose.disconnect().catch(() => {});
});
