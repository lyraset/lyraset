/**
 * The one thing the portal is for, checked end to end.
 *
 *   npm run dev
 *   npx tsx --test scripts/test-core.mjs
 *
 * An employee clocks in; the MD, the Owner and the CEO can all see that time.
 * The employee clocks out; the shift length is calculated, saved to the
 * database, and the MD, the Owner and the CEO can all see it.
 *
 * Writes to the database — run it against a scratch copy (see WORKSPACE.md).
 * Skips entirely if no server is up.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { fetchWithRetry, probeServer, signIn } from './test-http.mjs';

dotenv.config();

const BASE = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';
const SENIORS = ['md', 'owner', 'ceo'];
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
  // Ayesha is used here and nowhere else, so this suite cannot collide with
  // another one walking a different employee through the same day.
  sessions.employee = await signIn(BASE, 'DEMO-102', 'Demo@Ayesha2026');
  sessions.md = await signIn(BASE, 'DEMO-003', 'Demo@Md2026');
  sessions.owner = await signIn(BASE, 'DEMO-001', 'Demo@Owner2026');
  sessions.ceo = await signIn(BASE, 'DEMO-002', 'Demo@Ceo2026');
  db = await mongoose.connect(process.env.MONGODB_URI);
}

const skip = () =>
  serverUp ? false : 'no server at ' + BASE + ' — start `npm run dev` and seed first';

describe('clock in, seniors see it; clock out, the shift is saved and seniors see it', () => {
  test('the whole day, as the MD, the Owner and the CEO see it', { skip: skip() }, async () => {
    const users = mongoose.connection.collection('workspace_users');
    const attendance = mongoose.connection.collection('workspace_attendance');
    const eods = mongoose.connection.collection('workspace_eods');

    const ayesha = await users.findOne({ employeeId: 'DEMO-102' });
    const tz = ayesha.timezone;
    const workDate = DateTime.now().setZone(tz).toISODate();

    await attendance.deleteMany({ userId: ayesha._id, workDate });
    await eods.deleteMany({ userId: ayesha._id, workDate });

    try {
      // ---- Clock in ----------------------------------------------------------
      const clockIn = await call('employee', '/api/workspace/attendance/clock-in', {
        method: 'POST',
        body: {},
      });
      assert.equal(clockIn.status, 201, JSON.stringify(clockIn.data));
      const clockedInAt = new Date(clockIn.data.record.clockIn);

      // ---- Every senior sees the clock-in time -------------------------------
      for (const role of SENIORS) {
        const sheet = await call(role, '/api/workspace/attendance/team');
        assert.equal(sheet.status, 200, role + ' can open the team sheet');
        const row = sheet.data.rows.find((r) => r.employeeId === 'DEMO-102');
        assert.ok(row, role + ' sees Ayesha on the team sheet');
        assert.equal(
          new Date(row.clockIn).getTime(),
          clockedInAt.getTime(),
          role + ' sees the exact clock-in time'
        );
        assert.ok(row.localClockIn, role + ' sees it in Ayesha’s local time');
        assert.equal(row.clockOut, null, role + ' sees she has not clocked out yet');

        const live = await call(role, '/api/workspace/attendance/live');
        assert.equal(live.status, 200, role + ' can open the live board');
        const liveRow = live.data.rows.find((r) => r.employeeId === 'DEMO-102');
        assert.ok(
          ['IN', 'IN_LATE', 'ON_BREAK'].includes(liveRow.liveStatus),
          role + ' sees her as in'
        );
      }

      // Pretend the clock-in was this morning, so the shift has a real length
      // to calculate. Only the stored clock-in moves; the clock-out below is
      // stamped by the server at the moment it happens, as always.
      const morning = new Date(Date.now() - 3 * 60 * 60 * 1000);
      await attendance.updateOne({ userId: ayesha._id, workDate }, { $set: { clockIn: morning } });

      // ---- Clock out ---------------------------------------------------------
      const clockOut = await call('employee', '/api/workspace/attendance/clock-out', {
        method: 'POST',
        body: {
          tasks: [
            {
              title: 'Campaign review',
              description: 'Reviewed the week’s campaign results and adjusted the budgets.',
            },
          ],
        },
      });
      assert.equal(clockOut.status, 201, JSON.stringify(clockOut.data));

      // ---- The shift length is saved in the database, not just displayed ----
      const saved = await attendance.findOne({ userId: ayesha._id, workDate });
      assert.ok(saved.clockOut, 'the clock-out time is stored');
      assert.equal(typeof saved.workedMinutes, 'number', 'the shift length is stored');
      const expected = Math.round((saved.clockOut - saved.clockIn) / 60000);
      assert.equal(saved.workedMinutes, expected, 'and it is clock-out minus clock-in');
      assert.ok(saved.workedMinutes >= 175 && saved.workedMinutes <= 185, 'about three hours');

      // ---- Every senior sees the clock-out and the stored shift length -------
      for (const role of SENIORS) {
        const sheet = await call(role, '/api/workspace/attendance/team');
        const row = sheet.data.rows.find((r) => r.employeeId === 'DEMO-102');
        assert.equal(
          new Date(row.clockOut).getTime(),
          saved.clockOut.getTime(),
          role + ' sees the exact clock-out time'
        );
        assert.equal(row.workedMinutes, saved.workedMinutes, role + ' sees the saved shift length');
        assert.ok(row.localClockOut, role + ' sees it in Ayesha’s local time');

        // And the same numbers in her day-by-day history.
        const history = await call(
          role,
          '/api/workspace/attendance/history?userId=' +
            String(ayesha._id) +
            '&from=' +
            workDate +
            '&to=' +
            workDate
        );
        assert.equal(history.status, 200, role + ' can open her history');
        assert.equal(
          history.data.days[0].record.workedMinutes,
          saved.workedMinutes,
          role + ' sees the saved shift length in her history'
        );
      }

      // ---- The employee cannot see anyone else's day ------------------------
      const blocked = await call('employee', '/api/workspace/attendance/team');
      assert.equal(blocked.status, 403, 'an employee cannot open the team sheet');
    } finally {
      await attendance.deleteMany({ userId: ayesha._id, workDate });
      await eods.deleteMany({ userId: ayesha._id, workDate });
    }
  });
});

after(async () => {
  if (db) await mongoose.disconnect().catch(() => {});
});
