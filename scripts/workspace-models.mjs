/**
 * Model imports for the standalone scripts.
 *
 * The models are `.js` files written in ESM, in a package that does not set
 * `"type": "module"`. Next's bundler resolves that fine, but a standalone
 * runner does not always: tsx transpiles them to CommonJS, so a default import
 * hands back the whole module namespace (`{ default, OFFICES, ... }`) instead
 * of the model itself, and `Model.createIndexes` is suddenly undefined.
 *
 * Importing the namespace and unwrapping `.default` works under both readings,
 * so every script imports its models from here rather than reaching into
 * models/workspace directly.
 */
import * as UserMod from '../models/workspace/User.js';
import * as SettingsMod from '../models/workspace/Settings.js';
import * as OfficeMod from '../models/workspace/Office.js';
import * as DepartmentMod from '../models/workspace/Department.js';
import * as ShiftMod from '../models/workspace/Shift.js';
import * as ShiftAssignmentMod from '../models/workspace/ShiftAssignment.js';
import * as SpecialScheduleMod from '../models/workspace/SpecialSchedule.js';
import * as ProjectMod from '../models/workspace/Project.js';
import * as LeaveTypeMod from '../models/workspace/LeaveType.js';
import * as LeaveBalanceMod from '../models/workspace/LeaveBalance.js';
import * as LeaveRequestMod from '../models/workspace/LeaveRequest.js';
import * as WorkRequestMod from '../models/workspace/WorkRequest.js';
import * as AttendanceMod from '../models/workspace/Attendance.js';
import * as EodMod from '../models/workspace/Eod.js';
import * as HolidayMod from '../models/workspace/Holiday.js';
import * as PayrollPeriodMod from '../models/workspace/PayrollPeriod.js';
import * as NotificationMod from '../models/workspace/Notification.js';
import * as AuditLogMod from '../models/workspace/AuditLog.js';

/**
 * Dig out the model whichever way the module was interpreted.
 *
 * Read as real ESM, `mod.default` is the model. Transpiled to CommonJS by tsx,
 * `mod.default` is the namespace again and the model sits one level further
 * down. A Mongoose model is a function, so unwrapping until we reach one
 * covers both without guessing which runtime we are in.
 */
function model(mod) {
  let current = mod;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === 'function') return current;
    if (!current?.default) break;
    current = current.default;
  }
  if (typeof current !== 'function') {
    throw new Error('Could not resolve a Mongoose model from ' + Object.keys(mod ?? {}).join(', '));
  }
  return current;
}

export const User = model(UserMod);
export const Settings = model(SettingsMod);
export const Office = model(OfficeMod);
export const Department = model(DepartmentMod);
export const Shift = model(ShiftMod);
export const ShiftAssignment = model(ShiftAssignmentMod);
export const SpecialSchedule = model(SpecialScheduleMod);
export const Project = model(ProjectMod);
export const LeaveType = model(LeaveTypeMod);
export const LeaveBalance = model(LeaveBalanceMod);
export const LeaveRequest = model(LeaveRequestMod);
export const WorkRequest = model(WorkRequestMod);
export const Attendance = model(AttendanceMod);
export const Eod = model(EodMod);
export const Holiday = model(HolidayMod);
export const PayrollPeriod = model(PayrollPeriodMod);
export const Notification = model(NotificationMod);
export const AuditLog = model(AuditLogMod);

// Named exports come through unchanged under both readings.
export const { OFFICES, WORK_MODES, EMPLOYMENT_TYPES } = UserMod;
export const { SINGLETON_KEY } = SettingsMod;
