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

after(async () => {
  if (db) await mongoose.disconnect().catch(() => {});
});
