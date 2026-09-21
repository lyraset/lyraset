import 'server-only';
import { DateTime } from 'luxon';
import { connectDB } from '../db.js';
import Eod from '../../../models/workspace/Eod.js';
import Attendance from '../../../models/workspace/Attendance.js';
import Project from '../../../models/workspace/Project.js';
import User from '../../../models/workspace/User.js';
import LeaveRequest from '../../../models/workspace/LeaveRequest.js';
import {
  getWorkspaceContext,
  cycleFor,
  scheduleFor,
  timezoneFor,
  assertPeriodOpen,
} from '../context.js';
import { HttpError } from '../auth.js';
import { signedAssetUrl } from '../uploads.js';

/**
 * End-of-day reports outside the clock-out path.
 *
 * The normal way an EOD is created is inside clockOutWithEod — they are one
 * action. This module covers the rest: submitting the report for a day that
 * was auto-closed, editing inside the Owner's window, and reading them back.
 */

/** Check the tasks against the Owner's minimum description length. */
export function validateTasks(tasks, settings) {
  const min = Number(settings?.eodMinDescriptionLength ?? 0);
  const problems = [];
  if (!tasks?.length) problems.push('Add at least one task before submitting.');
  tasks?.forEach((task, index) => {
    if (min > 0 && String(task.description ?? '').trim().length < min) {
      problems.push(
        'Task ' + (index + 1) + ': describe the work in at least ' + min + ' characters.'
      );
    }
  });
  return problems;
}

/** Fill in projectName from the project list so exports survive a rename. */
export async function decorateTasks(tasks) {
  const ids = [...new Set(tasks.map((t) => t.projectId).filter(Boolean))];
  if (!ids.length)
    return tasks.map((t) => ({
      ...t,
      projectId: null,
      projectName: t.projectName ?? 'Internal / Other',
    }));

  await connectDB();
  const projects = await Project.find({ _id: { $in: ids } })
    .select('name client')
    .lean();
  const byId = new Map(projects.map((p) => [String(p._id), p]));

  return tasks.map((task) => {
    const project = task.projectId ? byId.get(String(task.projectId)) : null;
    if (task.projectId && !project) {
      throw new HttpError(400, 'One of the selected projects no longer exists. Pick another.');
    }
    return {
      ...task,
      projectId: project ? task.projectId : null,
      projectName: project
        ? project.client
          ? project.client + ' — ' + project.name
          : project.name
        : 'Internal / Other',
    };
  });
}

/** Can this EOD still be edited by its author? */
export function isWithinEditWindow(eod, settings, now = new Date()) {
  const hours = Number(settings?.eodEditWindowHours ?? 0);
  if (hours <= 0) return false;
  const submitted = eod?.submittedAt ? new Date(eod.submittedAt) : null;
  if (!submitted) return false;
  return now.getTime() - submitted.getTime() <= hours * 3600_000;
}

/**
 * Submit an EOD for a day that was auto-closed, after the fact.
 * The report is flagged `lateSubmission`, and the day's `eodMissing` clears.
 */
export async function submitLateEod({ user, workDate, eod, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();
  await assertPeriodOpen({ office: user.office, date: workDate, ctx });

  const record = await Attendance.findOne({ userId: user.id, workDate }).lean();
  if (!record?.clockIn) {
    throw new HttpError(
      409,
      'There is no attendance record for that day, so there is nothing to report on.'
    );
  }

  const existing = await Eod.findOne({ userId: user.id, workDate }).lean();
  if (existing) throw new HttpError(409, 'An EOD for that day has already been submitted.');

  const problems = validateTasks(eod.tasks, ctx.settings);
  if (problems.length) throw new HttpError(400, problems[0]);

  const tasks = await decorateTasks(eod.tasks);
  const cycle = cycleFor(ctx, user, workDate);

  const created = await Eod.create({
    userId: user.id,
    attendanceId: record._id,
    workDate,
    cycleKey: cycle.key,
    office: user.office,
    tasks,
    blockers: eod.blockers ?? null,
    tomorrowPlan: eod.tomorrowPlan ?? null,
    links: eod.links ?? [],
    attachments: eod.attachments ?? [],
    submittedAt: now,
    lateSubmission: true,
  });

  await Attendance.updateOne(
    { _id: record._id },
    { $set: { eodId: created._id, eodMissing: false } }
  );

  return serializeEod(created.toObject());
}

/**
 * Edit an EOD inside the Owner's window. The previous text is pushed onto
 * `versions[]` first, so an edited report shows what it used to say.
 */
export async function editEod({ user, eodId, changes, now = new Date() }) {
  const ctx = await getWorkspaceContext();
  await connectDB();

  const eod = await Eod.findById(eodId).lean();
  if (!eod) throw new HttpError(404, 'That EOD no longer exists.');
  if (String(eod.userId) !== String(user.id)) {
    throw new HttpError(403, 'You can only edit your own EOD.');
  }
  await assertPeriodOpen({ office: eod.office, date: eod.workDate, ctx });

  if (!isWithinEditWindow(eod, ctx.settings, now)) {
    const hours = Number(ctx.settings?.eodEditWindowHours ?? 0);
    throw new HttpError(
      423,
      hours > 0
        ? 'The ' +
            hours +
            '-hour window for editing this EOD has passed. Ask for a correction instead.'
        : 'EODs cannot be edited once submitted. Ask for a correction instead.'
    );
  }

  const problems = validateTasks(changes.tasks, ctx.settings);
  if (problems.length) throw new HttpError(400, problems[0]);
  const tasks = await decorateTasks(changes.tasks);

  await Eod.updateOne(
    { _id: eod._id },
    {
      $push: {
        versions: {
          tasks: eod.tasks,
          blockers: eod.blockers,
          tomorrowPlan: eod.tomorrowPlan,
          editedAt: now,
          editedBy: user.id,
        },
      },
      $set: {
        tasks,
        blockers: changes.blockers ?? null,
        tomorrowPlan: changes.tomorrowPlan ?? null,
        links: changes.links ?? eod.links ?? [],
        attachments: changes.attachments ?? eod.attachments ?? [],
      },
    }
  );

  const fresh = await Eod.findById(eod._id).lean();
  return serializeEod(fresh);
}

/** Shape an EOD for the browser, with signed URLs for any attachments. */
export function serializeEod(eod, { includeVersions = false } = {}) {
  if (!eod) return null;
  return {
    id: String(eod._id),
    userId: String(eod.userId),
    workDate: eod.workDate,
    cycleKey: eod.cycleKey ?? null,
    office: eod.office,
    tasks: (eod.tasks ?? []).map((t) => ({
      projectId: t.projectId ? String(t.projectId) : null,
      projectName: t.projectName ?? null,
      title: t.title,
      description: t.description,
      minutes: t.minutes ?? null,
      status: t.status,
    })),
    blockers: eod.blockers ?? null,
    tomorrowPlan: eod.tomorrowPlan ?? null,
    links: eod.links ?? [],
    attachments: (eod.attachments ?? []).map((a) => ({
      publicId: a.publicId,
      filename: a.filename ?? null,
      resourceType: a.resourceType ?? 'image',
      url: signedAssetUrl(a.publicId, { resourceType: a.resourceType ?? 'image' }),
    })),
    submittedAt: eod.submittedAt ?? null,
    lateSubmission: Boolean(eod.lateSubmission),
    edited: (eod.versions?.length ?? 0) > 0,
    editCount: eod.versions?.length ?? 0,
    ...(includeVersions
      ? {
          versions: (eod.versions ?? []).map((v) => ({
            editedAt: v.editedAt,
            tasks: v.tasks,
            blockers: v.blockers ?? null,
            tomorrowPlan: v.tomorrowPlan ?? null,
          })),
        }
      : {}),
  };
}

/**
 * Who has not submitted an EOD for a given day.
 *
 * Only people who were supposed to work it: exempt users, weekends, holidays
 * and approved leave are all excluded, so the list is actionable rather than
 * a wall of false positives.
 */
export async function missingEodsFor({ workDate, office = null, ctx }) {
  const context = ctx ?? (await getWorkspaceContext());
  await connectDB();

  const userQuery = { status: 'ACTIVE', requiresAttendance: true };
  if (office) userQuery.office = office;
  const users = await User.find(userQuery).lean();
  if (!users.length) return [];

  const userIds = users.map((u) => u._id);
  const [records, eods] = await Promise.all([
    Attendance.find({ userId: { $in: userIds }, workDate }).lean(),
    Eod.find({ userId: { $in: userIds }, workDate })
      .select('userId')
      .lean(),
  ]);

  const recordByUser = new Map(records.map((r) => [String(r.userId), r]));
  const submitted = new Set(eods.map((e) => String(e.userId)));

  const leaves = await LeaveRequest.find({
    userId: { $in: userIds },
    status: { $in: ['APPROVED', 'PARTIALLY_APPROVED'] },
    approvedDates: workDate,
  })
    .select('userId')
    .lean();
  const onLeave = new Set(leaves.map((l) => String(l.userId)));

  const holidays = new Set(
    context.holidays
      .filter((h) => String(h.date).slice(0, 10) === workDate)
      .flatMap((h) => (h.offices?.length ? h.offices : ['ISLAMABAD', 'DUBAI']))
  );

  const missing = [];
  for (const user of users) {
    const id = String(user._id);
    if (submitted.has(id) || onLeave.has(id) || holidays.has(user.office)) continue;

    const schedule = scheduleFor(context, user, workDate);
    if (!schedule.working) continue;

    const record = recordByUser.get(id);
    // Someone who never clocked in has no EOD to give — that is an absence.
    if (!record?.clockIn) continue;

    missing.push({
      id,
      name: user.name,
      employeeId: user.employeeId,
      office: user.office,
      department: user.department ?? null,
      clockIn: record.clockIn,
      clockOut: record.clockOut ?? null,
      autoClosed: Boolean(record.autoClosed),
    });
  }
  return missing;
}

/** Turn a submitted-at instant into the employee's local date, for grouping. */
export function localDateOf(instant, ctx, user) {
  return DateTime.fromJSDate(new Date(instant), { zone: timezoneFor(ctx, user) }).toISODate();
}
