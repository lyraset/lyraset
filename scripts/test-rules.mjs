/**
 * The spec's rule-based acceptance criteria, checked end to end.
 *
 *   npm run dev
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --with-history
 *   npx tsx --test scripts/test-rules.mjs
 *
 * These are the criteria that are about behaviour rather than permissions: the
 * auto clock-out, the company month window, everything running on Pakistan
 * time, and the Friday and Saturday shift lengths. They run against a live server and
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

const PK = 'Asia/Karachi';
const attendance = () => mongoose.connection.collection('workspace_attendance');
const eods = () => mongoose.connection.collection('workspace_eods');

/** Clear one employee's day, so a test can clock in afresh and re-run. */
async function clearDay(user, workDate) {
  await attendance().deleteMany({ userId: user._id, workDate });
  await eods().deleteMany({ userId: user._id, workDate });
}

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

describe('everything is Pakistan time', () => {
  test('there is one office and nobody has a timezone of their own', { skip: skip() }, async () => {
    const list = await call('owner', '/api/workspace/employees');
    assert.equal(list.status, 200);
    for (const user of list.data.users) {
      assert.equal(user.office, 'ISLAMABAD', user.employeeId + ' is at the Islamabad office');
      assert.equal('timezone' in user, false, user.employeeId + ' carries no timezone');
    }

    const offices = await call('owner', '/api/workspace/settings/offices');
    assert.equal(offices.status, 200);
    assert.deepEqual(
      offices.data.offices.map((o) => o.code),
      ['ISLAMABAD'],
      'there is only the one office'
    );
  });

  test('seniors see the clock-in on Pakistan’s clock and date', { skip: skip() }, async () => {
    if (!db) return;
    const ali = await findUser('DEMO-101');
    const workDate = DateTime.now().setZone(PK).toISODate();
    await clearDay(ali, workDate);

    try {
      const clockIn = await call('employee', '/api/workspace/attendance/clock-in', {
        method: 'POST',
        body: {},
      });
      assert.equal(clockIn.status, 201, JSON.stringify(clockIn.data));
      const stamped = new Date(clockIn.data.record.clockIn);

      const team = await call('md', '/api/workspace/attendance/team');
      assert.equal(team.status, 200);
      assert.equal(team.data.date, workDate, 'the sheet opens on today in Pakistan');
      const row = team.data.rows.find((r) => r.employeeId === 'DEMO-101');
      assert.equal(
        row.localClockIn,
        DateTime.fromJSDate(stamped, { zone: PK }).toFormat('HH:mm'),
        'the clock-in reads in Pakistan time'
      );
      assert.equal('timezone' in row, false);
    } finally {
      await clearDay(ali, workDate);
    }
  });
});

describe('a clock-in after the shift has ended is not saved as a zero-minute day', () => {
  test(
    'the forgotten session is closed a full window after the clock-in',
    { skip: skip() },
    async () => {
      if (!db) return;
      const ali = await findUser('DEMO-101');
      const settings = await mongoose.connection
        .collection('workspace_settings')
        .findOne({ key: 'COMPANY' });
      const offset = Number(settings?.autoClockOutOffsetHours ?? 4);

      // A recent weekday. The shift ends at 19:00 (18:00 on Friday), so a
      // 23:30 clock-in is after the old close time of shift end plus offset.
      let day = DateTime.now().setZone(PK).minus({ days: 3 }).startOf('day');
      while (day.weekday > 5) day = day.minus({ days: 1 });
      const workDate = day.toISODate();
      const clockIn = day.set({ hour: 23, minute: 30 });

      await clearDay(ali, workDate);
      const { insertedId } = await attendance().insertOne({
        userId: ali._id,
        workDate,
        office: ali.office,
        clockIn: clockIn.toJSDate(),
        clockOut: null,
        breaks: [],
        status: 'PRESENT',
        flags: [],
        autoClosed: false,
        eodMissing: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        // Loading the dashboard is what closes stale sessions.
        const today = await call('employee', '/api/workspace/attendance/today');
        assert.equal(today.status, 200);

        const saved = await attendance().findOne({ _id: insertedId });
        assert.ok(saved.clockOut, 'the session was closed');
        assert.ok(saved.clockOut > saved.clockIn, 'the close is after the clock-in');
        assert.equal(
          DateTime.fromJSDate(saved.clockOut, { zone: PK }).toISO({ suppressMilliseconds: true }),
          clockIn.plus({ hours: offset + 12 }).toISO({ suppressMilliseconds: true }),
          'closed the offset plus twelve hours after the clock-in'
        );
        assert.equal(saved.workedMinutes, (offset + 12) * 60, 'the saved day is not zero');
        assert.equal(saved.autoClosed, true);
        assert.equal(saved.status, 'MISSING_CLOCK_OUT', 'and it is flagged for a correction');
      } finally {
        await clearDay(ali, workDate);
        await mongoose.connection
          .collection('workspace_notifications')
          .deleteMany({ dedupeKey: 'autoclose:' + String(insertedId) });
      }
    }
  );
});

describe('clocking in never asks for an image', () => {
  test('an empty request is all it takes', { skip: skip() }, async () => {
    if (!db) return;
    const ali = await findUser('DEMO-101');

    // There is no photo rule to turn on: the field is not part of the office
    // settings any more, so it is dropped rather than stored.
    const patch = await call('owner', '/api/workspace/settings/offices', {
      method: 'PATCH',
      body: { code: 'ISLAMABAD', name: 'Islamabad', selfieRequired: true },
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.data));
    assert.equal(patch.data.office.selfieRequired, undefined, 'no photo rule exists');

    const workDate = DateTime.now().setZone(PK).toISODate();
    await clearDay(ali, workDate);
    try {
      const today = await call('employee', '/api/workspace/attendance/today');
      assert.equal(today.status, 200);
      assert.equal('photoRequired' in today.data, false, 'the dashboard asks for no photo');

      const clockIn = await call('employee', '/api/workspace/attendance/clock-in', {
        method: 'POST',
        body: {},
      });
      assert.equal(clockIn.status, 201, JSON.stringify(clockIn.data));
      const meta = clockIn.data.record.clockInMeta ?? {};
      assert.equal('hasSelfie' in meta, false, 'and keeps no image against the record');
      assert.equal('selfieId' in meta, false);
    } finally {
      await clearDay(ali, workDate);
    }
  });
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
    const user = { id: 'x', office: 'ISLAMABAD', shiftId: standard.id };
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

after(async () => {
  if (db) await mongoose.disconnect().catch(() => {});
});
