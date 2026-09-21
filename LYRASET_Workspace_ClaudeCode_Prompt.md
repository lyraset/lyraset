# Build the LYRASET Workspace: attendance and HR portal (`/workspace`)

You are working in the existing **LYRASET Int. Marketing Agency** website repository. The public site is live at https://www.lyraset.com and already has an admin CMS.

Your job is to add an internal **attendance and HR portal** at `/workspace`. Build it exactly as specified here. Where this spec is silent, choose the option that is simplest, safest and consistent with the rest of the spec. List those choices in your final summary.

---

## 0. How to work

1. **Explore first. Don't write code yet.** Read the repo structure, `package.json`, the Next.js version, any `src/` usage, `jsconfig.json`/`tsconfig.json` path aliases, the existing MongoDB connection helper, the existing admin CMS auth, the existing `middleware.js`/`proxy.js`, the root layout (how Bootstrap is loaded), `robots`, the sitemap and `vercel.json`.
2. **Write a short plan** that maps this spec onto the actual repo layout. Stop and show it to me before changing anything.
3. **Build phase by phase** (section 20). At the end of each phase:
   - run the linter, build and all tests
   - fix every failure
   - summarize what was done and what's next
   - make one commit per phase with a clear message
4. **Never break the public site or the admin CMS.** Workspace code must never be imported by public pages. The public site's performance and animations must stay untouched.
5. **Ask before anything destructive**: dropping collections, changing existing CMS models or auth, or rewriting the existing middleware beyond merging in workspace logic.
6. **Use the project's language.** If the project is JavaScript, stay in JavaScript. If it is TypeScript, convert the provided files to TypeScript with proper types.
7. **Keep business logic pure.** Put calculations (attendance status, lateness, overtime, company-month cycles, leave quota) in pure modules under `lib/workspace/calc/` so they are unit-testable without a database.

---

## 1. Stack and constraints

**Existing stack**
- **Framework:** Next.js (App Router). Keep the repo's current version.
- **Styling:** Bootstrap CSS. **Stylesheets stay separate from code files.** Portal styles live in `styles/workspace/*.css` and are imported only from `app/workspace/layout.js`. No inline style objects except trivial dynamic values.
- **Data:** MongoDB Atlas with Mongoose.
- **Files:** Cloudinary for employee documents, EOD attachments, leave certificates and optional clock-in selfies. Use **authenticated/private delivery** for HR documents and selfies, never public URLs.
- **Hosting:** Vercel.

**Libraries to add**
- `jose`: JWT sessions; works in edge middleware.
- `bcryptjs`: password hashing, cost 12.
- `zod`: validate every API input and server action.
- `luxon`: all timezone and date math.
- `exceljs`: `.xlsx` exports, with CSV as an alternative.
- `resend` or `nodemailer`: email notifications. Choose based on what the repo already uses.
- `tsx` (dev): run scripts and tests.

**Behaviour requirements**
- **Timezones:** store all timestamps in **UTC**. Compute everything (work date, lateness, cycles, reports) in the **employee's office timezone**: Islamabad is `Asia/Karachi`, Dubai is `Asia/Dubai`.
- **Server time only:** the browser never sends a timestamp for clock events. The server stamps `new Date()`.
- **Mobile-first:** most employees will clock in from their phones.
- **Search engines:** the whole `/workspace` area is `noindex, nofollow`. Exclude it from the sitemap and add `Disallow: /workspace` to robots.

---

## 2. Existing RBAC foundation: integrate it, don't rewrite it

An RBAC layer has already been written and tested (13 passing tests). The files are provided in `lyraset-workspace-rbac.zip`. If they aren't in the repo yet, ask me to add them. Integrate them as-is, adjusting only paths and aliases to the repo.

| File | Purpose |
|---|---|
| `lib/workspace/permissions.js` | **Single source of truth**: ROLES, permission constants `P`, `ROLE_PERMISSIONS`, `getPermissions`, `can`, `canApprove`, `canAssignRole`, `canManageAccount` |
| `lib/workspace/routeAccess.js` | Page → permission map; segment-aware and deny-by-default |
| `lib/workspace/navigation.js` | Sidebar items, each tied to a permission |
| `lib/workspace/session.js` | HS256 JWT in the httpOnly cookie `lyr_ws_session` (12h); claims `role`, `ra` (requiresAttendance), `tv` (tokenVersion) |
| `lib/workspace/auth.js` | Server guards: `getCurrentUser` (re-validates against the DB: active, role, tokenVersion), `requirePageUser`, `requirePagePermission`, `requireApiUser`, `requireApiPermission`, `assertCanApprove`, `handleApiError` |
| `lib/workspace/passwords.js` | bcrypt hashing, a generator that avoids look-alike characters, a timing-safe placeholder hash |
| `lib/workspace/db.js` | Cached Mongoose connection. Replace with the repo's existing helper if one exists. |
| `lib/workspace/audit.js` + `models/workspace/AuditLog.js` | Audit logging to `workspace_audit_logs` |
| `models/workspace/User.js` | `workspace_users` collection, a single-Owner unique partial index, CEO forced to `requiresAttendance: false`, `toSafeUser` |
| `middleware.js` | First gate: session check, route map, cross-origin POST block, noindex/no-store headers. **Merge into the existing middleware if one exists.** On Next.js 16+, use `proxy.js` with a `proxy` export. |
| `app/api/workspace/auth/{login,logout,me}/route.js` | Login with per-account lockout (5 failures → 15-minute lock), logout (303 redirect), and current user |
| `app/api/workspace/employees/route.js` | GET the directory (view-all permission), POST to create an account (Owner only) |
| `app/workspace/layout.js`, `login/`, `(portal)/layout.js`, `(portal)/page.js` | Workspace shell, login page and a role-aware dashboard placeholder |
| `styles/workspace.css` | Dark navy theme tokens. Split into `styles/workspace/*.css` as the UI grows. |
| `scripts/seed-workspace.mjs` | Demo accounts. Needs `WORKSPACE_ALLOW_SEED=true`; `--clean` removes them. |
| `scripts/create-owner.mjs` | Bootstraps the one real Owner; `--reset` issues a new Owner password |
| `scripts/test-rbac.mjs` | RBAC regression tests: `npx tsx --test scripts/test-rbac.mjs` |

**Rules you must follow everywhere**

- **Never check a role by name.** Always use `can(user, P.X)`. The only exception is `permissions.js` itself.
- **Every new page** is added to `PAGE_RULES` in `routeAccess.js`, because unlisted pages are denied. It also calls `requirePagePermission(...)` (or `requirePageUser()`) at the top.
- **Every API handler and server action** starts with `requireApiPermission(...)` (or `requireApiUser()`). It validates input with zod and returns errors through `handleApiError`.
- **Every state-changing action writes an audit log** containing the actor, action, target, before/after values, IP and user agent.
- **Middleware is only the first gate.** The server guards are the real enforcement.

---

## 3. Roles and permissions (final, already encoded in `permissions.js`)

There are four roles: **OWNER, CEO, MD (Managing Director), EMPLOYEE**. There is exactly one Owner, enforced by a unique database index.

| Capability | Employee | MD | Owner | CEO |
|---|---|---|---|---|
| Clock in/out, breaks, own attendance (`attendance:self`) | ✅ | ✅ | ✅ | ❌ exempt |
| Submit EOD and view own EOD history (`eod:submit`) | ✅ | ✅ | ✅ | ❌ |
| Apply for leave, view own balance (`leave:request`) | ✅ | ✅ | ✅ | ❌ |
| Corrections, WFH, official duty, overtime claims (`request:submit`) | ✅ | ✅ | ✅ | ❌ |
| View own profile (`profile:view_own`) | ✅ | ✅ | ✅ | ✅ |
| Live "who's in now" board (`live_board:view`) | ❌ | ✅ | ✅ | ✅ |
| View all attendance (`attendance:view_all`) | ❌ | ✅ | ✅ | ✅ |
| View all EODs (`eod:view_all`) | ❌ | ✅ | ✅ | ✅ |
| Leave calendar (`leave_calendar:view`) | ❌ | ✅ | ✅ | ✅ |
| View and export reports (`reports:view`, `reports:export`) | ❌ | ✅ | ✅ | ✅ |
| Approve leaves, corrections, overtime, WFH, official duty (`approvals:manage`) | ❌ | ❌ | ✅ | ✅ |
| Edit attendance records (`attendance:edit`) | ❌ | ❌ | ✅ | ❌ |
| Create/deactivate accounts, set/reset passwords (`employees:manage`) | ❌ | ❌ | ✅ | ❌ |
| All settings (`settings:manage`) | ❌ | ❌ | ✅ | ❌ |
| Lock/unlock the monthly period (`payroll:lock`) | ❌ | ❌ | ✅ | ❌ |
| Audit log (`audit:view`) | ❌ | ❌ | ✅ | ✅ |

**Special rules**

- **CEO exemption.** The CEO never clocks in and has no attendance, EOD or leave records. They are excluded from absence marking, late reports and missing-EOD lists.
- **Exemption flag.** `requiresAttendance: false` strips the self-service attendance permissions from any user. All attendance logic, crons and reports must key off this flag, never off the role name.
- **Approvals.**
  - Nobody approves their own request (`canApprove`).
  - Employee and MD requests can be approved by the Owner or the CEO.
  - The **Owner's requests can only be approved by the CEO**.
- **Role assignment.** The Owner can assign EMPLOYEE, MD or CEO from the portal. The OWNER role can only be created by `scripts/create-owner.mjs`.
- **Owner account protection.** Owner accounts cannot be modified through the portal (`canManageAccount`).
- **MD is read-only for oversight.** The MD can view everything (attendance, EODs, reports, leave calendar, live board) but cannot edit records, approve anything, manage employees or change any setting.

---

## 4. Accounts and credentials (Owner only)

**Account policy**
- There is **no sign-up** and **no self-service password reset or change**. Employees never set their own passwords.
- The Owner creates every account, including the MD's and the CEO's.

**Creating an account.** The Owner enters:
- Employee ID (e.g. `LYR-0012`)
- name and work email
- role
- profile fields (section 5)
- a password, either typed by the Owner or generated. A generated password is **shown once** in a modal with a copy button and is never retrievable again.

**Login and lockout**
- Users sign in with an **Employee ID or email** plus their password.
- **Lockout:** 5 failed attempts lock the account for 15 minutes. The Owner can unlock it sooner.
- The login page says "Forgot your password? The Owner can reset it for you."

**Owner actions on an account**
- **Reset password:** generates a new password, shows it once, and increments `tokenVersion` so every existing session is logged out.
- **Unlock account.**
- **Force logout:** increments `tokenVersion`.
- **Deactivate or reactivate:** a deactivated account can't log in, and all of its history is kept. **Nothing is ever hard-deleted.**
- **Change role:** increments `tokenVersion`.

**Audit.** Log every login, failed login, lock, unlock, reset, role change, activation change and logout.

---

## 5. Employee HR profiles

**Personal fields:** full name, photo (Cloudinary), date of birth, phone, personal email, address, emergency contact (name, relation, phone).

**Employment fields:**
- Employee ID, designation, department (from a list the Owner manages), reporting manager
- office: `ISLAMABAD` or `DUBAI`, with the timezone derived from it
- work mode: `OFFICE`, `HYBRID` or `REMOTE`
- shift assignment with an effective date
- joining date

**Employment status fields:**
- type: `PERMANENT`, `PROBATION`, `CONTRACT` or `INTERN`
- probation end date and confirmation date
- exit date and exit type: Resigned, Terminated or Contract ended
- status: `ACTIVE` or `INACTIVE`

**Documents:** CV, offer letter, contract, ID copy and degrees. Store them in private Cloudinary storage. Only the Owner can upload, view or delete them.

**Sensitive ID numbers** (e.g. CNIC) are optional. If stored, encrypt them at rest with AES-256-GCM, keyed by the env var `WORKSPACE_FIELD_KEY`, and show them masked.

**Who can see and edit what**
- Employees view their own profile, read-only, at `/workspace/profile`.
- The Owner edits all profiles.
- The MD and CEO can see directory-level fields (name, ID, designation, department, office, work mode, status) but not personal details or documents.

---

## 6. Company month (payroll cycle)

- **Setting:** the Owner sets the **company month start day, from 1 to 28**. For example, a start day of 26 means the September cycle runs from 26 August to 25 September.
- **What follows the cycle** rather than the calendar month:
  - dashboard "this month" stats
  - monthly leave quota reset
  - late-count deductions
  - all monthly reports and exports
  - the payroll lock
  - leave carry-forward
- **Changing the start day** takes effect from the **next** cycle. Store it with `effectiveFrom`. Past cycles keep their original start and end dates, which are stored on `payrollPeriods`.
- **Where the logic lives:** `lib/workspace/calc/cycle.js`, with functions `getCycleForDate(date, settingsHistory, tz)` and `listCycles(...)`. Unit-test month boundaries, February, year rollover and a mid-year change of start day.

---

## 7. Shifts and schedules

**A shift is a weekly schedule defined day by day.** For each day of the week the Owner sets `working` (on/off), `start`, `end` and `breakMinutes`. Each shift also has a `graceMinutes` value.

The demo default shift, which the seed creates and the Owner can edit:

| Day | Working | Start | End | Break |
|---|---|---|---|---|
| Mon–Thu | yes | 10:00 | 19:00 | 60 |
| Fri | yes | 10:00 | 18:00 | 90 (Jummah) |
| Sat | yes | 10:00 | 14:00 | 0 |
| Sun | off | — | — | — |

**Rules**
- **Overnight days:** if `end` is earlier than `start`, the day ends the next morning, and the attendance record belongs to the date the shift **started**.
- **Required minutes per day** = end − start − breakMinutes. A short Saturday therefore isn't treated as a half-day.
- **Off days** count as weekend: no absence is marked.
- **Multiple shifts** are allowed (e.g. "Standard", "Night — US clients"). They are assigned per employee through `shiftAssignments` with `effectiveFrom`/`effectiveTo`, so changing a shift never rewrites history.
- **Date-range overrides (`specialSchedules`)** such as Ramadan timings or a one-off early close. An override replaces the per-day times for its date range and applies to all employees or to chosen offices.
- **Flexible shift option:** no fixed start time and no late marking; only the required daily minutes count.

**Where the logic lives:** `lib/workspace/calc/schedule.js`, with `getScheduleForDay(user, date)` that resolves the assignment, then any override, then the day's rule. Unit-test overnight shifts, overrides and a change of assignment.

---

## 8. Clock in / clock out

**Employee dashboard (`/workspace`)**
- A large **Clock In / Clock Out** button, the current time in the employee's timezone and today's shift.
- A live "worked today" timer and a status badge: Not clocked in, On time, Late, On break, Clocked out.
- **Breaks:** Start Break / End Break with a type (Lunch, Prayer or Other). Break time is subtracted from worked minutes. The Owner decides in settings whether breaks are paid or unpaid.
- **One attendance record per user per work date.** Enforce this with a unique index on `(userId, workDate)` and a server check that there is no open session before creating one.
- **Idempotency:** a double tap must never create two records or two clock-outs.

**Integrity checks** are configurable per office in settings and are skipped for `REMOTE` staff (who are still logged):
- **IP allowlist:** CIDR ranges per office.
- **Geofence:** latitude, longitude and radius in metres per office, using browser geolocation.
- **Optional selfie** captured on clock-in and uploaded to private Cloudinary storage.

**What each clock event stores:** IP, user agent and geolocation (with accuracy), plus the selfie URL if enabled, in `clockInMeta`/`clockOutMeta`.

**Official duty and client visits.** Clocking in outside the geofence by an `OFFICE` or `HYBRID` employee requires a reason. The record is flagged `OFFICIAL_DUTY_PENDING` and goes to approvals.

**Consent.** On first login, employees are shown what is collected (location, IP, selfie if enabled) and must acknowledge it. Store the acknowledgment with a timestamp.

---

## 9. End-of-Day (EOD) report: required on clock-out

**The flow**
1. The employee clicks **Clock Out**, which opens a **modal dialog** instead of clocking out immediately.
2. The dialog shows today's summary (clock-in time, hours worked, breaks, status) and the EOD form.
3. The primary button reads **"Submit EOD & clock out"**. The server saves the EOD and the clock-out **in one MongoDB transaction**, and the clock-out time is stamped at submission.
4. Clock-out is impossible without an EOD. Cancelling the dialog keeps the employee clocked in.

**Form fields**

*Tasks* (repeatable rows, at least one required):
- client/project, picked from a list the Owner manages, with an "Internal / Other" option
- task title
- description, with a minimum length set in settings
- time spent in minutes (optional)
- status: Completed, In progress or Blocked

*Other fields:*
- blockers (optional)
- plan for tomorrow (optional)
- links and attachments uploaded to Cloudinary (optional)

**Draft saving.** The form autosaves a draft to `localStorage` under a key per user and date, so a closed tab doesn't lose the text. The draft is cleared after a successful submission.

**Edge cases**
- **Auto clock-out** (by cron or lazy close, section 16) marks the day `eodMissing: true`. The employee can submit it later from EOD history, and it is flagged `lateSubmission: true`.
- **Edit window:** employees can edit an EOD until a cutoff the Owner sets (e.g. until midnight, or N hours). Every edit keeps the previous version in `versions[]` and shows an "edited" label.
- **Locked periods:** after the Owner locks a payroll period, EODs in that period are read-only.
- **Who submits:** the CEO has no EODs. The MD and Owner submit EODs like everyone else.

**Employee view (`/workspace/eod`)**
- List and calendar views of their own EODs, with that day's hours shown next to each.
- Search, and filters by client/project, status and date range.
- An export of their own EODs.

**Leadership view (`/workspace/team/eod`, for MD, Owner and CEO)**
- A daily feed of every EOD, filterable by date, employee, department and client/project.
- A **Missing EODs** list for the selected day.
- Excel export, e.g. all work done for one client in a cycle, for client reporting.
- The employee drill-down page shows attendance and the EOD side by side for each day.

---

## 10. Attendance statuses and rules

| Status | Rule |
|---|---|
| `PRESENT` | Clocked in by start + grace and met the required minutes |
| `LATE` | Clocked in after start + grace. Store `lateByMinutes`. |
| `EARLY_LEAVE` | Clocked out before the shift end. Store `earlyByMinutes`. |
| `HALF_DAY` | Worked minutes below the half-day threshold % of required (set by the Owner, default 50%) |
| `SHORT_LEAVE` | Approved leave of a few hours within the day |
| `ABSENT` | Working day, no clock-in, no approved leave, not a holiday. Only for `requiresAttendance: true`. |
| `ON_LEAVE` | Approved leave (full or half day) |
| `HOLIDAY` / `WEEKEND` | From the holiday calendar or a shift off-day |
| `WFH` | Approved work-from-home day |
| `OFFICIAL_DUTY` | Approved outside work |
| `MISSING_CLOCK_OUT` | Auto-closed; needs a correction |

**Owner-configurable rules**
- grace minutes (per shift)
- late-to-deduction rule (e.g. every 3 lates in a cycle equals 1 half-day deduction)
- half-day threshold
- auto clock-out offset (hours after shift end, default 4)
- paid or unpaid breaks
- sandwich rule for leave (section 12)

**Where the logic lives:** `lib/workspace/calc/attendance.js`. `computeDayStatus(schedule, record, leaves, holidays)` must be pure and exhaustively unit-tested.

---

## 11. Overtime

- **Definition:** overtime is worked minutes beyond the day's required minutes.
- **Approval:** overtime **only counts after approval** by the Owner or CEO. Employees can submit an overtime claim with a reason, and the Owner or CEO can approve it from the day view.
- **Categories:** weekday, weekend and holiday overtime are tracked separately.
- **Output:** approved overtime appears in the payroll summary.

---

## 12. Leave management

**Leave types.** The Owner creates each type with:
- name, code and color
- **paid or unpaid**
- **counts toward monthly quota**, usually on for paid and off for unpaid
- an optional per-type monthly limit
- half-day allowed
- document required, with an optional "only if longer than N days"
- minimum advance notice in days
- active or inactive

Demo seed types: Casual (paid), Sick (paid, certificate if longer than 2 days), Unpaid (unpaid, doesn't count toward quota).

**Monthly leave quota** (company settings):
- `monthlyLeaveQuota`: paid leaves per employee per company month (e.g. 2). It resets on the cycle start day.
- `leaveCarryForward`: either `LAPSE` or `CARRY`, with `maxCarryForward`.
- `overQuotaBehavior`: either `BLOCK` or `CONVERT_TO_UNPAID`.
- Half-days count as 0.5.
- `sandwichRule` on/off: when on, weekends or holidays that fall between leave days count as leave days.

**Employee flow (`/workspace/leave`)**
1. Choose a type, dates, full or half day, a reason, and an attachment if required.
2. Before submitting, the form shows **"Paid leaves remaining this cycle: X"** and whether the chosen type is paid.
3. A request that spans two cycles is split and charged against each cycle.
4. A pending request can be cancelled. Cancelling an approved future leave sends it back for approval, and the balance is restored when approved.

**Approval flow.** The Owner or CEO can approve, reject or partially approve (some dates) with a comment. On approval, the balance updates and the affected attendance days change to `ON_LEAVE`.

**Leave calendar (`/workspace/leave-calendar`):** shows who is off on which day. Visible to the MD, Owner and CEO.

**Where the logic lives:** `lib/workspace/calc/leave.js`. Unit-test quota, carry-forward, over-quota conversion, the sandwich rule, half-days and requests that span cycles.

**Legal compliance.** Leave quotas, working-hour limits and overtime rates differ between Pakistan and the UAE. Settings must therefore support **per-office policies** (quota, weekend days, leave types). Put a visible note in the settings UI: "Confirm leave and working-hour policies with your HR/legal advisor for each office."

---

## 13. Holidays

- **Calendar:** the Owner maintains a public holiday calendar **per office** (or all offices).
- **Short-notice changes:** moon-dependent holidays such as Eid can be added or moved at short notice. Adding a holiday recalculates affected days in open periods.
- **Office closures:** the Owner can declare a one-off closure, which is treated as a holiday.

---

## 14. Requests: corrections, WFH, official duty

Requests are handled on `/workspace/requests`. Each request has a type, the relevant data, a reason, optional evidence, a status and a reviewer with a comment. Approval follows `canApprove`.

- **Correction:** for a missed clock-in or clock-out, a wrong time, or a missing EOD. The employee gives the proposed times and a reason. Approval updates the attendance record and writes an audit entry with before/after values.
- **WFH:** a request for specific dates. Approved days are marked `WFH`.
- **Official duty:** a request for specific dates or times with a location and reason. Approved days are marked `OFFICIAL_DUTY`.
- **Overtime claim:** see section 11.

---

## 15. Leadership views

**Live board**, on the dashboard for users with `live_board:view`: shows who is in, on break, late, not yet arrived, on leave, WFH or on official duty, with counts at the top. It refreshes every 60 seconds.

**Team attendance (`/workspace/team`):** a daily sheet with every employee's in/out times, hours, breaks, status, flags and EOD submitted (yes/no). It has a date picker and filters by office, department and status.

**Employee drill-down (`/workspace/team/[id]`):**
- a cycle calendar with attendance and the EOD per day
- stats: attendance %, late count, average in-time, average hours, leave balance and overtime
- a directory-level profile summary

**Approvals inbox (`/workspace/approvals`, Owner and CEO):** pending leaves, corrections, overtime, WFH and official duty, with a filter by type. Each action records a comment.

**Manual edits (Owner only):** available on the day and drill-down views. A reason is required, and every edit is audited.

**Reports (`/workspace/reports`):** filter by date range or cycle, employee, office and department. Export as Excel or CSV. The reports are:
- monthly attendance register (muster roll)
- late arrivals
- absentees
- leave balances
- leave history
- overtime
- department summary
- individual employee report
- EOD/work log by client or project
- missing EODs

---

## 16. Scheduled jobs (Vercel Cron) and lazy evaluation

All cron routes live under `/api/workspace/cron/*`. They are protected by `Authorization: Bearer ${CRON_SECRET}` (Vercel's convention) and bypass session auth **only** with that header. Every job is idempotent and safe to re-run.

**Jobs**
- **Auto clock-out:** closes open sessions older than shift end + offset, sets `autoClosed: true`, `MISSING_CLOCK_OUT` and `eodMissing: true`, and notifies the employee.
- **Absence marking:** marks `ABSENT` for yesterday in each office's timezone, for `requiresAttendance: true` users only.
- **Cycle rollover:** runs leave carry-forward or lapse and creates the next `payrollPeriods` document.
- **Notifications:** clock-in and clock-out reminders, and the leadership daily summary.

**Lazy evaluation.** Vercel Hobby only allows daily crons. So also run the auto-close check **lazily**: whenever a user loads the dashboard or clocks in, close any stale open session first. The logic must be correct even if a cron runs late. Configure `vercel.json` with a daily schedule that works on Hobby, and note in the README which schedules to tighten on the Pro plan.

---

## 17. Monthly close and payroll summary

**Locking (`/workspace/payroll-close`, Owner only)**
- The Owner reviews a cycle per office, then **locks** it.
- A locked period makes that cycle's attendance, requests and EODs read-only for everyone.
- Unlocking requires a reason and is audited.

**Payroll summary per employee per cycle:**
- total working days
- present days
- paid leave days
- unpaid leave days
- absences
- late count and the resulting deduction days
- half-days
- approved overtime by category (weekday, weekend, holiday)
- WFH and official duty days

The summary exports to Excel.

---

## 18. Notifications

Notifications are delivered in-app (a bell icon with an unread count) and by email.

**For employees**
- a reminder if not clocked in 15 minutes after shift start (working days only, not on leave or a holiday)
- a clock-out reminder at shift end
- notice of an auto clock-out
- the result of every request and leave application

**For approvers (Owner and CEO):** new pending approvals.

**For leadership:** a morning summary of yesterday's attendance, lates, absences and missing EODs.

**For the Owner:** a probation-ending alert 7 days ahead.

Each type of notification can be toggled on or off in settings.

---

## 19. Settings (`/workspace/settings/*`, Owner only)

| Page | Contents |
|---|---|
| `/company` | Company month start day (with effective date), monthly leave quota, carry-forward mode and max, over-quota behavior, sandwich rule, late-to-deduction rule, half-day threshold, auto clock-out offset, paid/unpaid breaks, EOD edit window, EOD minimum description length |
| `/shifts` | Weekly per-day shift builder, grace minutes, flexible option, assign to employees with an effective date |
| `/schedules` | Date-range overrides (Ramadan, early close) |
| `/leave-types` | Create, edit and retire leave types (section 12) |
| `/holidays` | Holiday calendar per office and closures |
| `/projects` | Client/project list for EOD tasks |
| `/departments` | Department list |
| `/offices` | Per office: timezone, weekend days, IP allowlist (CIDR), geofence (lat, lng, radius), selfie on/off, policy note |
| `/notifications` | Toggles for each notification type |

Every settings change is audited.

---

## 20. Data model (MongoDB)

All workspace collections are prefixed `workspace_`. Add sensible indexes, including every lookup by `userId + workDate`, `status`, `createdAt` and cycle dates.

| Collection | Key fields |
|---|---|
| `workspace_users` | *(exists)*, plus the profile fields from section 5, `consentAcknowledgedAt`, `departmentId`, `managerId`, `probationEnd`, `confirmationDate`, `exitDate`, `exitType`, encrypted `nationalId` |
| `workspace_settings` | singleton; company settings with a `cycleStartHistory[{ day, effectiveFrom }]` |
| `workspace_offices` | code, name, timezone, weekendDays, ipAllowlist[], geofence{lat,lng,radiusM}, selfieRequired |
| `workspace_departments` | name, active |
| `workspace_shifts` | name, days{mon..sun:{working,start,end,breakMinutes}}, graceMinutes, flexible, active |
| `workspace_shift_assignments` | userId, shiftId, effectiveFrom, effectiveTo |
| `workspace_special_schedules` | name, from, to, offices[], days{...} overrides |
| `workspace_attendance` | userId, workDate (YYYY-MM-DD in user's tz), clockIn, clockOut, breaks[{type,start,end}], workedMinutes, requiredMinutes, overtimeMinutes, overtimeApproved, status, lateByMinutes, earlyByMinutes, clockInMeta, clockOutMeta, autoClosed, eodMissing, officialDutyPending, editedBy/editReason; **unique (userId, workDate)** |
| `workspace_eods` | userId, attendanceId, workDate, tasks[{projectId,title,description,minutes,status}], blockers, tomorrowPlan, attachments[], submittedAt, lateSubmission, versions[] |
| `workspace_projects` | name, client, active |
| `workspace_leave_types` | name, code, color, paid, countsTowardQuota, monthlyLimit, allowHalfDay, requiresDocument, documentAfterDays, minNoticeDays, offices[], active |
| `workspace_leave_balances` | userId, cycleStart, cycleEnd, quota, carriedIn, used, pending |
| `workspace_leave_requests` | userId, leaveTypeId, from, to, halfDay, days, paidDays, unpaidDays, reason, attachment, status, reviewedBy, reviewComment, cycleSplits[] |
| `workspace_requests` | userId, type (CORRECTION/WFH/OFFICIAL_DUTY/OVERTIME), payload, reason, evidence, status, reviewedBy, reviewComment |
| `workspace_holidays` | date, name, offices[], isClosure |
| `workspace_payroll_periods` | office, startDate, endDate, status (OPEN/LOCKED), lockedBy, lockedAt, unlockHistory[] |
| `workspace_notifications` | userId, type, message, link, read |
| `workspace_audit_logs` | *(exists)* |

---

## 21. Routes

**Pages.** Each must be in `PAGE_RULES` and call a guard.

| Route | Access |
|---|---|
| `/workspace/login` | public |
| `/workspace` | any signed-in user (dashboard adapts to role) |
| `/workspace/attendance` | `attendance:self` |
| `/workspace/eod` | `eod:submit` |
| `/workspace/leave` | `leave:request` |
| `/workspace/requests` | `request:submit` |
| `/workspace/profile` | `profile:view_own` |
| `/workspace/team`, `/workspace/team/[id]` | `attendance:view_all` |
| `/workspace/team/eod` | `eod:view_all` |
| `/workspace/leave-calendar` | `leave_calendar:view` |
| `/workspace/reports` | `reports:view` (export needs `reports:export`) |
| `/workspace/approvals` | `approvals:manage` |
| `/workspace/employees`, `/workspace/employees/[id]` | `employees:manage` |
| `/workspace/settings/*` | `settings:manage` |
| `/workspace/payroll-close` | `payroll:lock` |
| `/workspace/audit` | `audit:view` |

**API.** Everything lives under `/api/workspace/*`, with a permission check in each handler: auth, employees (CRUD, reset password, unlock, force logout, deactivate), attendance (clock-in, clock-out+EOD, break start/end, today, history, day edits), eod, leave, requests, approvals, reports/export, settings/*, payroll, notifications, uploads (signed Cloudinary uploads), and cron/*.

---

## 22. UI and design

- **Theme:** match the brand's **dark navy/blue corporate** look, using the tokens in `styles/workspace.css` (bg `#070e21`, surface `#0e1a36`, line `#22345e`, text `#e8eefc`, muted `#93a3c7`, accent `#3d7bff`). Use the site's existing font.
- **Motion:** keep it calm. No decorative animations. Motion only confirms user actions (modal open, clock-in success).
- **Components:** Bootstrap for grid, forms, modals, tables and alerts. Custom classes are prefixed `ws-` in separate CSS files.
- **Responsive:** the sidebar collapses to a top nav on mobile. Wide tables scroll horizontally inside their containers.
- **Accessibility:** visible keyboard focus, labels on every input, sufficient contrast, `prefers-reduced-motion` respected, and the EOD modal traps focus.
- **Copy:** plain and in the active voice, e.g. "Clock in", "Submit EOD & clock out", "Approve leave".
- **Errors** say what went wrong and how to fix it.
- **Empty states** tell the user what to do next.

---

## 23. Security checklist (must all be true)

- [ ] Every page and API route is guarded server-side. Middleware is not the only gate.
- [ ] Unlisted workspace pages are denied (deny-by-default map).
- [ ] Clock and EOD timestamps come from the server only.
- [ ] All input is validated with zod, and Mongo queries never use raw user objects (prevents NoSQL injection).
- [ ] Passwords are bcrypt cost 12. Password hashes, lock fields and tokens are never returned to the client.
- [ ] Password reset, deactivation and role change increment `tokenVersion`.
- [ ] Per-account login lockout. Optionally add an IP rate limit (e.g. Upstash) if it's easy to add.
- [ ] Cross-origin state-changing requests are blocked (Origin check). Cookies are `httpOnly`, `secure` and `sameSite=lax`.
- [ ] Cron routes need `CRON_SECRET`.
- [ ] HR documents and selfies are private in Cloudinary and delivered through short-lived signed URLs.
- [ ] Every state change is audited with before/after values.
- [ ] Locked payroll periods can't be edited through any route, including by the Owner, until unlocked.
- [ ] `/workspace` is noindex, excluded from the sitemap and disallowed in robots.
- [ ] No workspace code ends up in public page bundles. Verify with the build output.

**Environment variables:** `MONGODB_URI`, `WORKSPACE_JWT_SECRET` (48+ random bytes), `CRON_SECRET`, `WORKSPACE_FIELD_KEY`, the Cloudinary variables (reuse the existing ones), and the email provider key. Document them all in the README and in `.env.example`.

---

## 24. Seed data and demo accounts

Extend `scripts/seed-workspace.mjs`, which keeps its `WORKSPACE_ALLOW_SEED=true` guard and `--clean` flag, so that it also seeds:
- the demo default shift (section 7), assigned to everyone who clocks in
- company settings (cycle start day 1, quota 2, lapse, convert-to-unpaid)
- the Islamabad and Dubai offices
- departments
- the demo leave types
- a few demo projects

Mark everything seeded with `isSeedData: true`, so that `--clean` removes all of it.

**Demo accounts** (already defined in the seed script):

| Role | Name | Employee ID | Email | Password | Clocks in |
|---|---|---|---|---|---|
| Owner | Faisal Mehmood | DEMO-001 | owner@lyraset.test | Demo@Owner2026 | Yes |
| CEO | Hamza Qureshi | DEMO-002 | ceo@lyraset.test | Demo@Ceo2026 | No |
| Managing Director | Sana Iqbal | DEMO-003 | md@lyraset.test | Demo@Md2026 | Yes |
| Employee: Web Dev, Islamabad, office | Ali Raza | DEMO-101 | ali@lyraset.test | Demo@Ali2026 | Yes |
| Employee: Performance Marketing, Islamabad, hybrid | Ayesha Khan | DEMO-102 | ayesha@lyraset.test | Demo@Ayesha2026 | Yes |
| Employee: SEO, Islamabad, remote | Usman Tariq | DEMO-103 | usman@lyraset.test | Demo@Usman2026 | Yes |
| Employee: Content & Social, Dubai, office | Mahnoor Siddiqui | DEMO-104 | mahnoor@lyraset.test | Demo@Mahnoor2026 | Yes |

Also add an optional `--with-history` flag that generates about 30 days of realistic attendance, EODs and a few leaves and requests for the demo users, so reports and dashboards can be tested.

---

## 25. Build phases (one commit each; tests pass at the end of each)

**Phase 1: Core**
- Integrate the RBAC files.
- Employee management (create, reset, unlock, deactivate, force logout) and HR profiles.
- Offices, per-day shifts, special schedules and the company month.
- Clock in/out with breaks.
- The **EOD dialog**, with a transactional clock-out.
- The employee dashboard, attendance history and EOD history.
- The live board, team daily sheet, Team EODs and employee drill-down.
- The audit log page.
- Seed extensions.

**Phase 2: Attendance rules**
- Status engine (late, early, half-day, absent), late-to-deduction rule and overtime with approval.
- Auto clock-out (cron + lazy) and the absence cron.
- Corrections, WFH, official duty and the approvals inbox.
- IP, geofence and consent.
- Holidays.
- Reports with Excel/CSV export.

**Phase 3: Leave**
- Leave types (paid/unpaid), the monthly quota, carry-forward and over-quota behavior.
- The sandwich rule, half-days and splitting across cycles.
- Leave application and approval, and the leave calendar.

**Phase 4: Payroll and polish**
- Payroll period lock/unlock and the payroll summary export.
- Notifications (in-app and email).
- Optional selfie verification.
- A PWA manifest so employees can install the portal on their phones.
- `--with-history` seed.
- README.

---

## 26. Tests and acceptance criteria

**Automated tests** (`npx tsx --test`):
- the existing `scripts/test-rbac.mjs`, which must keep passing
- unit tests for `calc/cycle`, `calc/schedule`, `calc/attendance` and `calc/leave`, covering the edge cases listed in sections 6, 7, 10 and 12
- API tests: for each role, call each protected endpoint and assert 401 or 403 or success according to the permission table

**Manual acceptance.** Verify each of these with the demo accounts and report the result:

1. **Ali (employee):**
   - can clock in, take a break, and clock out only through the EOD dialog
   - sees his EOD history
   - is redirected with a notice when opening `/workspace/team`, `/workspace/reports` or `/workspace/settings`
   - gets 403 from the equivalent APIs
2. **Sana (MD):**
   - clocks in and out and submits EODs
   - sees the live board, all attendance, all EODs, the leave calendar and reports, and can export
   - cannot open approvals, employees, settings, payroll-close or audit
   - has no edit buttons anywhere
3. **Hamza (CEO):**
   - has no clock button (the dashboard shows "exempt") and gets 403 from every clock/EOD/leave API
   - sees all views, approvals and the audit log
   - can approve Faisal's leave
   - cannot open employees, settings or payroll-close
4. **Faisal (Owner):**
   - has full access and creates a new employee with a generated password shown once
   - can reset a password, after which the old session is logged out
   - cannot approve his own leave
   - can lock a period, after which edits fail everywhere
5. **Company month:** with the start day set to 26, dashboards, quotas and reports use the 26th-to-25th window.
6. **Friday shift:** a Friday with shift 10:00–18:00 and a 90-minute break computes 6.5 required hours. A 14:00 Saturday end isn't marked half-day.
7. **Dubai timezone:** Mahnoor's work date and lateness are computed in `Asia/Dubai`.
8. **Leave quota:** with a quota of 2, a third paid-leave day in a cycle is blocked or converted to unpaid according to settings.
9. **Auto clock-out:** an open session is auto-closed, flagged, and allows a late EOD submission.
10. **Security:** no workspace JS appears on public pages, and `/workspace` responses have `X-Robots-Tag: noindex`.

When you finish, give me:
- a summary of what was built in each phase
- any deviations from this spec, with reasons
- the full list of environment variables
- the exact commands to seed, test and create the real Owner
