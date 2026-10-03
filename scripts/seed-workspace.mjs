/**
 * Demo data for the LYRASET Workspace.
 *
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --with-history
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --clean
 *
 * Windows PowerShell:
 *   $env:WORKSPACE_ALLOW_SEED="true"; npx tsx scripts/seed-workspace.mjs
 *
 * Everything written here carries isSeedData: true, so --clean removes all of
 * it and nothing else. Demo passwords are published in this file — run --clean
 * before real staff go live.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';

import {
  User,
  Settings,
  Office,
  Department,
  Shift,
  ShiftAssignment,
  Project,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  WorkRequest,
  Attendance,
  Eod,
  Holiday,
  SINGLETON_KEY,
} from './workspace-models.mjs';

import { ROLES, ROLE_LABELS } from '../lib/workspace/permissions.js';
import { hashPassword } from '../lib/workspace/passwords.js';
import { getScheduleForDay } from '../lib/workspace/calc/schedule.js';
import { computeDayStatus, STATUS } from '../lib/workspace/calc/attendance.js';
import { getCycleForDate } from '../lib/workspace/calc/cycle.js';
import { TIMEZONE } from '../lib/workspace/timezone.js';

dotenv.config();

// ---------------------------------------------------------------- accounts --

const DEMO_ACCOUNTS = [
  {
    employeeId: 'DEMO-001',
    name: 'Faisal Mehmood',
    email: 'owner@lyraset.test',
    password: 'Demo@Owner2026',
    role: ROLES.OWNER,
    requiresAttendance: true,
    designation: 'Owner',
    department: 'Management',
    office: 'ISLAMABAD',
    workMode: 'OFFICE',
    employmentType: 'PERMANENT',
  },
  {
    employeeId: 'DEMO-002',
    name: 'Hamza Qureshi',
    email: 'ceo@lyraset.test',
    password: 'Demo@Ceo2026',
    role: ROLES.CEO,
    requiresAttendance: false,
    designation: 'Chief Executive Officer',
    department: 'Management',
    office: 'ISLAMABAD',
    workMode: 'OFFICE',
    employmentType: 'PERMANENT',
  },
  {
    employeeId: 'DEMO-003',
    name: 'Sana Iqbal',
    email: 'md@lyraset.test',
    password: 'Demo@Md2026',
    role: ROLES.MD,
    requiresAttendance: true,
    designation: 'Managing Director',
    department: 'Management',
    office: 'ISLAMABAD',
    workMode: 'OFFICE',
    employmentType: 'PERMANENT',
  },
  {
    employeeId: 'DEMO-101',
    name: 'Ali Raza',
    email: 'ali@lyraset.test',
    password: 'Demo@Ali2026',
    role: ROLES.EMPLOYEE,
    requiresAttendance: true,
    designation: 'Web Developer',
    department: 'Web Development',
    office: 'ISLAMABAD',
    workMode: 'OFFICE',
    employmentType: 'PERMANENT',
  },
  {
    employeeId: 'DEMO-102',
    name: 'Ayesha Khan',
    email: 'ayesha@lyraset.test',
    password: 'Demo@Ayesha2026',
    role: ROLES.EMPLOYEE,
    requiresAttendance: true,
    designation: 'Performance Marketing Executive',
    department: 'Performance Marketing',
    office: 'ISLAMABAD',
    workMode: 'HYBRID',
    employmentType: 'PERMANENT',
  },
  {
    employeeId: 'DEMO-103',
    name: 'Usman Tariq',
    email: 'usman@lyraset.test',
    password: 'Demo@Usman2026',
    role: ROLES.EMPLOYEE,
    requiresAttendance: true,
    designation: 'SEO Specialist',
    department: 'SEO',
    office: 'ISLAMABAD',
    workMode: 'REMOTE',
    employmentType: 'CONTRACT',
  },
  {
    employeeId: 'DEMO-104',
    name: 'Mahnoor Siddiqui',
    email: 'mahnoor@lyraset.test',
    password: 'Demo@Mahnoor2026',
    role: ROLES.EMPLOYEE,
    requiresAttendance: true,
    designation: 'Social Media & Content Executive',
    department: 'Content & Social',
    office: 'ISLAMABAD',
    workMode: 'OFFICE',
    employmentType: 'PROBATION',
  },
];

const DEPARTMENTS = [
  'Management',
  'Web Development',
  'Performance Marketing',
  'SEO',
  'Content & Social',
  'Graphic Design',
];

/** The one office. Every time in the portal is Pakistan time. */
const OFFICE = {
  code: 'ISLAMABAD',
  name: 'Islamabad',
  weekendDays: [7],
  policyNote:
    'Confirm working-hour limits, leave entitlements and overtime rates with your HR/legal advisor.',
};

/** The demo default shift from the spec. */
const STANDARD_SHIFT = {
  name: 'Standard',
  graceMinutes: 15,
  flexible: false,
  isDefault: true,
  active: true,
  days: {
    mon: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    tue: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    wed: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    thu: { working: true, start: '10:00', end: '19:00', breakMinutes: 60 },
    // Friday closes early with a longer break for Jummah.
    fri: { working: true, start: '10:00', end: '18:00', breakMinutes: 90 },
    sat: { working: true, start: '10:00', end: '14:00', breakMinutes: 0 },
    sun: { working: false, start: null, end: null, breakMinutes: 0 },
  },
};

const LEAVE_TYPES = [
  {
    name: 'Casual',
    code: 'CL',
    color: '#3d7bff',
    paid: true,
    countsTowardQuota: true,
    allowHalfDay: true,
  },
  {
    name: 'Sick',
    code: 'SL',
    color: '#f0b429',
    paid: true,
    countsTowardQuota: true,
    allowHalfDay: true,
    requiresDocument: true,
    documentAfterDays: 2,
  },
  {
    name: 'Unpaid',
    code: 'UP',
    color: '#93a3c7',
    paid: false,
    countsTowardQuota: false,
    allowHalfDay: false,
  },
];

const PROJECTS = [
  { name: 'Internal / Other', client: null, isInternal: true },
  { name: 'Website revamp', client: 'Reon Studio' },
  { name: 'Always-on social', client: 'Arabic Label' },
  { name: 'Performance campaigns', client: 'Lifestyle Brand' },
  { name: 'SEO retainer', client: 'Reon Studio' },
];

// ------------------------------------------------------------------ helpers --

const SEED = { isSeedData: true };

async function upsert(model, filter, doc) {
  await model.updateOne(
    filter,
    { $set: { ...doc, ...SEED } },
    { upsert: true, runValidators: true }
  );
  return model.findOne(filter).lean();
}

function log(step, detail) {
  console.log('  ' + step.padEnd(22) + detail);
}

// --------------------------------------------------------------- seed steps --

async function seedReferenceData() {
  const office = await upsert(Office, { code: OFFICE.code }, OFFICE);
  // An older seed also created a Dubai office; there is only one office now.
  await Office.deleteMany({ code: { $ne: OFFICE.code }, isSeedData: true });
  log('office', office.name + ' (Pakistan time)');

  const departments = [];
  for (const name of DEPARTMENTS) {
    departments.push(await upsert(Department, { name }, { name, active: true }));
  }
  log('departments', String(departments.length));

  const shift = await upsert(Shift, { name: STANDARD_SHIFT.name }, STANDARD_SHIFT);
  log('shift', shift.name + ' (Mon-Thu 10:00-19:00, Fri 10:00-18:00, Sat 10:00-14:00)');

  const leaveTypes = [];
  for (const type of LEAVE_TYPES) {
    leaveTypes.push(await upsert(LeaveType, { code: type.code }, type));
  }
  log('leave types', leaveTypes.map((t) => t.name).join(', '));

  const projects = [];
  for (const project of PROJECTS) {
    projects.push(
      await upsert(Project, { name: project.name, client: project.client ?? null }, project)
    );
  }
  log('projects', String(projects.length));

  // The company settings singleton. Seeded values match the spec defaults.
  await Settings.updateOne(
    { key: SINGLETON_KEY },
    {
      $set: {
        monthlyLeaveQuota: 2,
        leaveCarryForward: 'LAPSE',
        maxCarryForward: 0,
        overQuotaBehavior: 'CONVERT_TO_UNPAID',
        sandwichRule: false,
        halfDayThresholdPercent: 50,
        autoClockOutOffsetHours: 4,
        paidBreaks: false,
        lateToDeduction: { lateCount: 3, deductionDays: 0.5 },
        eodEditWindowHours: 12,
        eodMinDescriptionLength: 20,
        ...SEED,
      },
      $setOnInsert: {
        key: SINGLETON_KEY,
        cycleStartHistory: [{ day: 1, effectiveFrom: new Date('2020-01-01T00:00:00Z') }],
      },
    },
    { upsert: true }
  );
  log('settings', 'cycle start day 1, quota 2, lapse, convert-to-unpaid');

  return { shift, leaveTypes, projects, departments };
}

async function seedAccounts({ shift, departments }) {
  const realOwner = await User.findOne({ role: ROLES.OWNER, isSeedData: { $ne: true } }).lean();
  const departmentByName = new Map(departments.map((d) => [d.name, d]));
  const rows = [];
  const created = [];

  for (const { password, ...account } of DEMO_ACCOUNTS) {
    if (account.role === ROLES.OWNER && realOwner) {
      console.warn(
        '  A real Owner (' + realOwner.email + ') exists, so the demo Owner was skipped.'
      );
      continue;
    }

    const user = await User.findOneAndUpdate(
      { email: account.email },
      {
        $set: {
          ...account,
          departmentId: departmentByName.get(account.department)?._id ?? null,
          passwordHash: await hashPassword(password),
          joiningDate: new Date('2026-01-01'),
          probationEnd: account.employmentType === 'PROBATION' ? new Date('2026-07-01') : null,
          shiftId: shift._id,
          status: 'ACTIVE',
          failedLoginAttempts: 0,
          lockUntil: null,
          // Demo accounts skip the first-login consent screen.
          consentAcknowledgedAt: new Date('2026-01-01'),
          ...SEED,
        },
        $inc: { tokenVersion: 1 }, // re-seeding signs out old demo sessions
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Everyone who clocks in is put on the standard shift from their start date.
    if (user.requiresAttendance) {
      await ShiftAssignment.updateOne(
        { userId: user._id, shiftId: shift._id },
        {
          $set: { effectiveFrom: new Date('2026-01-01'), effectiveTo: null, ...SEED },
          $setOnInsert: { userId: user._id, shiftId: shift._id },
        },
        { upsert: true }
      );
    }

    created.push(user);
    rows.push({
      Role: ROLE_LABELS[account.role],
      Name: account.name,
      'Employee ID': account.employeeId,
      Email: account.email,
      Password: password,
      'Clocks in': user.requiresAttendance ? 'Yes' : 'No',
    });
  }

  return { rows, users: created };
}

// ------------------------------------------------------------------ history --

/** Deterministic pseudo-randomness, so a re-seed produces the same history. */
function seededRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const TASK_TITLES = [
  'Homepage hero rebuild',
  'Campaign creative round 2',
  'Keyword gap analysis',
  'Client weekly report',
  'Bug triage and fixes',
  'Content calendar for next month',
  'Landing page QA',
  'Ad account audit',
];

async function seedHistory({ users, shift, leaveTypes, projects, days = 30 }) {
  const settings = await Settings.findOne({ key: SINGLETON_KEY }).lean();
  const holidays = await Holiday.find({}).lean();
  const cycleHistory = settings?.cycleStartHistory ?? [];
  const rules = {
    halfDayThresholdPercent: settings?.halfDayThresholdPercent ?? 50,
    paidBreaks: settings?.paidBreaks ?? false,
  };

  const clockers = users.filter((u) => u.requiresAttendance);
  let attendanceCount = 0;
  let eodCount = 0;

  for (const user of clockers) {
    const random = seededRandom(user.employeeId.split('-')[1] * 7 + 13);
    const tz = TIMEZONE;
    const today = DateTime.now().setZone(tz).startOf('day');

    for (let back = days; back >= 1; back -= 1) {
      const date = today.minus({ days: back });
      const workDate = date.toISODate();

      const schedule = getScheduleForDay({
        user: { ...user, id: String(user._id) },
        date: workDate,
        shifts: [shift],
        assignments: [],
        defaultShift: shift,
      });
      if (!schedule.working) continue;

      const roll = random();
      // A realistic spread: mostly on time, some lateness, the odd absence.
      if (roll > 0.94) continue; // absent: no record at all, which is what an absence looks like

      const lateMinutes = roll > 0.78 ? Math.floor(random() * 45) + 16 : Math.floor(random() * 12);
      const clockIn = DateTime.fromJSDate(schedule.startAt, { zone: tz }).plus({
        minutes: lateMinutes,
      });
      const overtime = roll > 0.88 ? Math.floor(random() * 90) : 0;
      const clockOut = DateTime.fromJSDate(schedule.endAt, { zone: tz }).plus({
        minutes: overtime - (roll < 0.08 ? Math.floor(random() * 50) + 10 : 0),
      });

      const breakStart = clockIn.plus({ minutes: 180 });
      const breakMinutes = schedule.breakMinutes || 30;
      const breaks = [
        {
          type: 'LUNCH',
          start: breakStart.toJSDate(),
          end: breakStart.plus({ minutes: breakMinutes }).toJSDate(),
        },
      ];

      const record = { clockIn: clockIn.toJSDate(), clockOut: clockOut.toJSDate(), breaks };
      const computed = computeDayStatus(schedule, record, [], holidays, {
        rules,
        office: user.office,
        now: clockOut.plus({ hours: 2 }).toJSDate(),
        requiresAttendance: true,
      });
      const cycle = getCycleForDate(workDate, cycleHistory, tz);

      const saved = await Attendance.findOneAndUpdate(
        { userId: user._id, workDate },
        {
          $set: {
            office: user.office,
            cycleKey: cycle.key,
            clockIn: record.clockIn,
            clockOut: record.clockOut,
            breaks,
            workedMinutes: computed.workedMinutes,
            requiredMinutes: computed.requiredMinutes,
            breakMinutes: computed.breakMinutes,
            lateByMinutes: computed.lateByMinutes,
            earlyByMinutes: computed.earlyByMinutes,
            overtimeMinutes: computed.overtimeMinutes,
            overtimeCategory: 'WEEKDAY',
            status: computed.status,
            flags: computed.flags,
            shiftId: shift._id,
            scheduleSource: 'SHIFT',
            clockInMeta: {
              ip: '203.0.113.' + (10 + Math.floor(random() * 40)),
              userAgent: 'Seed data',
            },
            clockOutMeta: {
              ip: '203.0.113.' + (10 + Math.floor(random() * 40)),
              userAgent: 'Seed data',
            },
            ...SEED,
          },
          $setOnInsert: { userId: user._id, workDate },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      attendanceCount += 1;

      // Most days get an EOD; a couple are deliberately missing so the
      // "Missing EODs" list has something to show.
      if (random() > 0.12) {
        const taskCount = 1 + Math.floor(random() * 2);
        const tasks = [];
        for (let i = 0; i < taskCount; i += 1) {
          const project = projects[Math.floor(random() * projects.length)];
          tasks.push({
            projectId: project.isInternal ? null : project._id,
            projectName: project.client ? project.client + ' — ' + project.name : project.name,
            title: TASK_TITLES[Math.floor(random() * TASK_TITLES.length)],
            description:
              'Worked through the agreed scope, reviewed the output and handed it on for feedback.',
            minutes: 120 + Math.floor(random() * 180),
            status: random() > 0.2 ? 'COMPLETED' : 'IN_PROGRESS',
          });
        }

        await Eod.findOneAndUpdate(
          { userId: user._id, workDate },
          {
            $set: {
              attendanceId: saved._id,
              cycleKey: cycle.key,
              office: user.office,
              tasks,
              tomorrowPlan: 'Continue with the open items.',
              submittedAt: clockOut.toJSDate(),
              lateSubmission: false,
              ...SEED,
            },
            $setOnInsert: { userId: user._id, workDate },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        await Attendance.updateOne(
          { _id: saved._id },
          {
            $set: {
              eodId: (await Eod.findOne({ userId: user._id, workDate }).select('_id').lean())._id,
              eodMissing: false,
            },
          }
        );
        eodCount += 1;
      } else {
        await Attendance.updateOne({ _id: saved._id }, { $set: { eodMissing: true } });
      }
    }
  }

  const { leaves, requests } = await seedRequests({ users: clockers, leaveTypes, cycleHistory });
  return { attendanceCount, eodCount, leaves, requests };
}

/** A handful of leave applications and requests, in each state. */
async function seedRequests({ users, leaveTypes, cycleHistory }) {
  const casual = leaveTypes.find((t) => t.code === 'CL');
  const sick = leaveTypes.find((t) => t.code === 'SL');
  let leaves = 0;
  let requests = 0;

  for (const [index, user] of users.entries()) {
    const tz = TIMEZONE;
    const today = DateTime.now().setZone(tz).startOf('day');

    // One approved day of leave last week.
    const pastDate = nextWorkingDay(today.minus({ days: 7 }));
    const pastCycle = getCycleForDate(pastDate.toISODate(), cycleHistory, tz);
    await LeaveRequest.findOneAndUpdate(
      { userId: user._id, from: pastDate.toISODate(), leaveTypeId: casual._id },
      {
        $set: {
          to: pastDate.toISODate(),
          office: user.office,
          halfDay: false,
          days: 1,
          paidDays: 1,
          unpaidDays: 0,
          countedDates: [pastDate.toISODate()],
          approvedDates: [pastDate.toISODate()],
          cycleSplits: [
            {
              cycleKey: pastCycle.key,
              cycleStart: pastCycle.start,
              cycleEnd: pastCycle.end,
              days: 1,
              paidDays: 1,
              unpaidDays: 0,
              dates: [pastDate.toISODate()],
            },
          ],
          reason: 'Family commitment.',
          status: 'APPROVED',
          reviewedAt: pastDate.minus({ days: 2 }).toJSDate(),
          ...SEED,
        },
        $setOnInsert: { userId: user._id, from: pastDate.toISODate(), leaveTypeId: casual._id },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    await Attendance.updateOne(
      { userId: user._id, workDate: pastDate.toISODate() },
      { $set: { status: STATUS.ON_LEAVE, clockIn: null, clockOut: null, workedMinutes: 0 } }
    );
    leaves += 1;

    // The first two employees also have something pending, for the inbox.
    if (index < 2) {
      const future = nextWorkingDay(today.plus({ days: 5 + index }));
      const futureCycle = getCycleForDate(future.toISODate(), cycleHistory, tz);
      await LeaveRequest.findOneAndUpdate(
        { userId: user._id, from: future.toISODate(), leaveTypeId: sick._id },
        {
          $set: {
            to: future.toISODate(),
            office: user.office,
            halfDay: false,
            days: 1,
            paidDays: 1,
            unpaidDays: 0,
            countedDates: [future.toISODate()],
            approvedDates: [],
            cycleSplits: [
              {
                cycleKey: futureCycle.key,
                cycleStart: futureCycle.start,
                cycleEnd: futureCycle.end,
                days: 1,
                paidDays: 1,
                unpaidDays: 0,
                dates: [future.toISODate()],
              },
            ],
            reason: 'Medical appointment.',
            status: 'PENDING',
            ...SEED,
          },
          $setOnInsert: { userId: user._id, from: future.toISODate(), leaveTypeId: sick._id },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      await LeaveBalance.updateOne(
        { userId: user._id, cycleKey: futureCycle.key },
        {
          $setOnInsert: {
            userId: user._id,
            cycleKey: futureCycle.key,
            cycleStart: futureCycle.start,
            cycleEnd: futureCycle.end,
            quota: 2,
            carriedIn: 0,
            used: 0,
          },
          $set: { pending: 1, ...SEED },
        },
        { upsert: true }
      );
      leaves += 1;

      const correctionDate = today.minus({ days: 3 + index }).toISODate();
      await WorkRequest.findOneAndUpdate(
        { userId: user._id, type: 'CORRECTION', dates: [correctionDate] },
        {
          $set: {
            office: user.office,
            payload: { clockOut: '19:10' },
            reason: 'I forgot to clock out before leaving.',
            status: 'PENDING',
            ...SEED,
          },
          $setOnInsert: { userId: user._id, type: 'CORRECTION', dates: [correctionDate] },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      requests += 1;
    }
  }

  return { leaves, requests };
}

function nextWorkingDay(dt) {
  let cursor = dt;
  for (let i = 0; i < 7 && cursor.weekday === 7; i += 1) cursor = cursor.plus({ days: 1 });
  return cursor;
}

// --------------------------------------------------------------------- main --

const SEEDED_MODELS = [
  ['attendance', Attendance],
  ['EODs', Eod],
  ['leave requests', LeaveRequest],
  ['leave balances', LeaveBalance],
  ['requests', WorkRequest],
  ['shift assignments', ShiftAssignment],
  ['users', User],
  ['shifts', Shift],
  ['leave types', LeaveType],
  ['projects', Project],
  ['departments', Department],
  ['offices', Office],
  ['holidays', Holiday],
];

async function main() {
  if (process.env.WORKSPACE_ALLOW_SEED !== 'true') {
    console.error(
      'Refusing to run: set WORKSPACE_ALLOW_SEED=true to confirm you want demo data in this database.'
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to database "' + mongoose.connection.name + '"');

  if (process.argv.includes('--clean')) {
    for (const [label, model] of SEEDED_MODELS) {
      const { deletedCount } = await model.deleteMany({ isSeedData: true });
      if (deletedCount) log(label, 'removed ' + deletedCount);
    }
    await Settings.updateOne(
      { key: SINGLETON_KEY, isSeedData: true },
      { $set: { isSeedData: false } }
    );
    console.log('Demo data removed.');
    return;
  }

  for (const [, model] of SEEDED_MODELS) await model.createIndexes();

  console.log('\nReference data');
  const reference = await seedReferenceData();

  console.log('\nAccounts');
  const { rows, users } = await seedAccounts(reference);

  if (process.argv.includes('--with-history')) {
    console.log('\nHistory (about 30 days)');
    const history = await seedHistory({ users, ...reference });
    log('attendance days', String(history.attendanceCount));
    log('EODs', String(history.eodCount));
    log('leave requests', String(history.leaves));
    log('other requests', String(history.requests));
  }

  console.log('\nDemo accounts');
  console.table(rows);
  console.log('Sign in at /workspace/login with the Employee ID or the email.');
  if (!process.argv.includes('--with-history')) {
    console.log('Add --with-history to generate ~30 days of attendance, EODs, leave and requests.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
