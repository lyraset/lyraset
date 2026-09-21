# LYRASET Workspace

The internal attendance and HR portal at `/workspace`. It shares this
repository, its database connection and its Cloudinary account with the public
site and the admin CMS, but nothing else: no workspace code is imported by a
public page, and its styles load only inside the portal.

Written for: whoever maintains this repository next.

---

## What it does

Employees clock in and out from their phones, submit an end-of-day report when
they clock out, apply for leave, and ask for corrections. The MD and CEO watch
what is happening without being able to change it. The Owner runs the place:
accounts, shifts, holidays, approvals, payroll close.

Four roles, one permission table:

|                                                                      | Employee | MD  | Owner | CEO       |
| -------------------------------------------------------------------- | -------- | --- | ----- | --------- |
| Clock in/out, EOD, leave, requests                                   | ✅       | ✅  | ✅    | ❌ exempt |
| See everyone's attendance, EODs, reports, leave calendar, live board | ❌       | ✅  | ✅    | ✅        |
| Approve leave and requests                                           | ❌       | ❌  | ✅    | ✅        |
| Edit attendance, manage accounts, settings, payroll lock             | ❌       | ❌  | ✅    | ❌        |
| Audit log                                                            | ❌       | ❌  | ✅    | ✅        |

The CEO never clocks in and has no attendance, EOD or leave records at all.
The Owner's own requests can only be approved by the CEO, because nobody
approves their own.

---

## Getting it running

```bash
npm install

# Fill in the workspace variables — see .env.example for what each one is for.
cp .env.example .env.local

npm run dev
```

Then create either demo data or a real Owner.

### Demo data (development)

Point `MONGODB_URI` at a scratch database first. The passwords below are
published in the seed script.

```bash
# Windows PowerShell
$env:WORKSPACE_ALLOW_SEED="true"; npm run seed:workspace -- --with-history

# macOS / Linux
WORKSPACE_ALLOW_SEED=true npm run seed:workspace -- --with-history
```

This creates the two offices with their own weekends, six departments, the
standard shift, three leave types, five projects, company settings, and seven
accounts. `--with-history` adds about thirty days of attendance, EODs, leave
and requests so the reports and dashboards have something to show. It is
deterministic, so re-seeding reproduces the same history.

| Role                                      | Name             | Employee ID | Password           | Clocks in |
| ----------------------------------------- | ---------------- | ----------- | ------------------ | --------- |
| Owner                                     | Faisal Mehmood   | `DEMO-001`  | `Demo@Owner2026`   | Yes       |
| CEO                                       | Hamza Qureshi    | `DEMO-002`  | `Demo@Ceo2026`     | No        |
| Managing Director                         | Sana Iqbal       | `DEMO-003`  | `Demo@Md2026`      | Yes       |
| Employee (Web Dev, Islamabad, office)     | Ali Raza         | `DEMO-101`  | `Demo@Ali2026`     | Yes       |
| Employee (Performance, Islamabad, hybrid) | Ayesha Khan      | `DEMO-102`  | `Demo@Ayesha2026`  | Yes       |
| Employee (SEO, Islamabad, remote)         | Usman Tariq      | `DEMO-103`  | `Demo@Usman2026`   | Yes       |
| Employee (Content, Dubai, office)         | Mahnoor Siddiqui | `DEMO-104`  | `Demo@Mahnoor2026` | Yes       |

Sign in at `/workspace/login` with the Employee ID or the email.

### Going live

```bash
# Remove every demo record. Only rows marked isSeedData are touched.
WORKSPACE_ALLOW_SEED=true npm run seed:workspace -- --clean

# Create the one real Owner. The password is printed once.
npm run create-owner -- --name "Full Name" --email owner@lyraset.com --employee-id LYR-0001
```

The portal cannot create an Owner — the role is not assignable and the database
enforces a single-Owner unique index. If the Owner forgets their password:

```bash
npm run create-owner -- --reset
```

---

## Tests

```bash
npm test          # 106 unit tests, no database or server needed
npm run test:live # 87 more against a running, seeded server
npm run test:all  # both
```

`npm test` covers the RBAC matrix and the four pure calculation modules,
including the edge cases that are easy to get wrong: February and year
rollovers, a mid-year change of the company month start day, overnight shifts,
date-range overrides, the grace window, paid versus unpaid breaks, the sandwich
rule, and leave that spans two cycles.

`npm run test:live` needs `npm run dev` and a seeded database in another
terminal. It signs in as each role and calls every protected endpoint and page,
asserting the exact status the permission table says it should get, then walks
the real flows: clock in, break, EOD and clock-out, leave against a quota,
payroll locking, password reset, auto clock-out. It skips itself if no server
is reachable, so it never fails for the wrong reason.

---

## How it is put together

```
lib/workspace/
  permissions.js      the single source of truth for who can do what
  routeAccess.js      route → permission, deny-by-default
  auth.js             the server guards every page and handler starts with
  session.js          the signed cookie (HS256, 12 hours)
  context.js          reference data, cached per request, plus assertPeriodOpen
  calc/               pure business logic, no database
    cycle.js          the company month
    schedule.js       which shift applied on a day
    attendance.js     the one definition of present, late, absent, half day
    leave.js          counted days, quota, carry-forward, the sandwich rule
  services/           everything that touches the database
models/workspace/     18 collections, all prefixed workspace_
app/workspace/        27 pages
app/api/workspace/    54 route handlers
components/workspace/ the client components
styles/workspace/     loaded only by the workspace layout
```

The shape worth understanding is the split between `calc/` and `services/`.
Everything that decides something — was this late, how many days does this
leave cost, which cycle is this in — is a pure function that takes plain data
and returns plain data. The services load the data and write the results. That
is why the rules can be tested exhaustively without a database, and why the
dashboard, the nightly cron and the payroll export cannot disagree about
whether a day was late: they all call the same function.

### Four rules that hold everywhere

**The server stamps every time.** No clock endpoint accepts a timestamp. A
wrong device clock changes nothing that is recorded.

**Middleware is the first gate, not the enforcement.** It checks the cookie and
the route map cheaply. The real check is `requirePagePermission` /
`requireApiPermission`, which re-reads the user from the database on every
request — so a deactivated account, a changed role or a reset password takes
effect on the very next request rather than when a 12-hour token expires.

**Nothing is deleted.** Deactivating an account keeps its whole history.
Retiring a project or a leave type sets `active: false` so old records still
point at something real. Editing an EOD keeps the previous text.

**A locked period is locked for everyone.** `assertPeriodOpen` is called by
every dated write, so the lock is enforced at the data layer rather than by
each route remembering. The Owner cannot edit through it either.

### Timezones

Every timestamp is stored in UTC. Every calculation runs in the employee's
office timezone — `Asia/Karachi` for Islamabad, `Asia/Dubai` for Dubai — which
is derived from the office and cannot be set by hand. A `workDate` is a plain
`YYYY-MM-DD` string, not a `Date`, because it is a calendar label: storing it
as an instant would make "which day was this?" depend on who is reading.

### The EOD and the clock-out are one action

Clicking Clock Out opens the report dialog; the clock-out is stamped when the
report is submitted, and both are written in one MongoDB transaction. Cancelling
leaves the employee clocked in with their draft intact (it autosaves to
`localStorage` per user and date). Where the deployment has no transactions —
a standalone mongod on a developer's machine — the EOD is removed again if the
clock-out fails.

---

## Scheduled jobs (optional)

**The portal is correct without any scheduler.** `vercel.json` declares no cron
jobs, so it deploys on a free Vercel account with nothing to configure.

That works because the things that matter are computed when they are read, not
written by a nightly job:

- **Absences.** A past working day with no clock-in and no approved leave reads
  as `ABSENT` wherever it is shown — the team sheet, the drill-down, every
  report. The status engine decides it from the schedule and the record; the
  job only writes it down.
- **Auto clock-out.** A session left open is closed the moment anyone loads the
  dashboard or clocks in, at the shift end plus the Owner's offset — not at the
  time it was noticed.
- **Leave carry-forward.** If a cycle was never rolled, the next cycle's
  carry-in is computed from it on demand, using the same function the job uses.

What you do lose without a scheduler is the things that are inherently timed,
because nothing is there to fire them:

- clock-in and clock-out reminders
- the morning attendance summary for leadership
- the probation-ending alert to the Owner

Everything else still appears under the bell when it happens — a leave decision
notifies the employee at the moment it is decided, not on a schedule.

### Turning them on later

The routes exist and are secured; they just are not scheduled. Set `CRON_SECRET`
and add one entry — the free plan allows two:

```json
"crons": [{ "path": "/api/workspace/cron/daily", "schedule": "0 20 * * *" }]
```

`0 20 * * *` is 01:00 in Islamabad and 00:00 in Dubai, after both offices have
finished and the auto-close offset has passed. The `daily` route runs every job
in sequence — sessions are closed before absence is judged — keeps going if one
fails, and returns 207 when a run was partial.

Anything that can make an authenticated request works just as well: an external
uptime pinger, a GitHub Action, a cron on any machine you own.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://www.lyraset.com/api/workspace/cron/daily
```

On a paid plan the individual routes can be scheduled separately and tightened:

```json
"crons": [
  { "path": "/api/workspace/cron/auto-close",     "schedule": "0 * * * *" },
  { "path": "/api/workspace/cron/reminders",      "schedule": "*/15 * * * *" },
  { "path": "/api/workspace/cron/mark-absent",    "schedule": "0 20 * * *" },
  { "path": "/api/workspace/cron/cycle-rollover", "schedule": "30 20 * * *" },
  { "path": "/api/workspace/cron/daily-summary",  "schedule": "0 3 * * *" }
]
```

Reminders are the one job that really wants a tight schedule: they only fire
within an hour of becoming due, so once a day they catch only the shifts near
that hour. Every notification is deduplicated, so running it every fifteen
minutes sends nothing twice.

Without `CRON_SECRET` set, every cron route returns 503 and refuses to run —
they fail closed, so leaving it unset is safe.

---

## Environment variables

Documented in full in `.env.example`. The workspace-specific ones:

| Variable               | Required                | What it does                                                            |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `MONGODB_URI`          | yes                     | Shared with the CMS; the workspace adds `workspace_*` collections       |
| `WORKSPACE_JWT_SECRET` | yes                     | Signs the session cookie. 32 chars minimum, 48 random bytes recommended |
| `WORKSPACE_FIELD_KEY`  | if storing national IDs | AES-256-GCM key. Rotating it makes stored values unreadable             |
| `CRON_SECRET`          | yes in production       | Without it the cron routes refuse everything rather than failing open   |
| `CLOUDINARY_*`         | for file uploads        | Shared with the public site                                             |
| `RESEND_API_KEY`       | optional                | Without it, notifications still appear under the bell                   |
| `WORKSPACE_EMAIL_FROM` | with email              | A verified Resend sender                                                |
| `WORKSPACE_ALLOW_SEED` | never in production     | Must be exactly `true` for the seed script to run                       |

---

## Adding a page

1. Create it under `app/workspace/(portal)/`.
2. Add it to `PAGE_RULES` in `lib/workspace/routeAccess.js`. **An unlisted page
   is denied** — that is the point of the map, not an oversight to work around.
3. Call `requirePagePermission(P.SOMETHING)` at the top. The route map is not
   enough on its own.
4. Add it to `NAV_ITEMS` in `lib/workspace/navigation.js` if it needs a link.

Adding an API route is the same shape: `requireApiPermission` first, zod for
the input, `logAudit` for anything that changes state, and `handleApiError`
around the whole thing (the `api()` wrapper in `lib/workspace/route.js` does
the last part for you).

Never check a role by name. Ask `can(user, P.X)`. `permissions.js` is the only
file that knows what a role is, and the tests assert its table independently —
so editing `ROLE_PERMISSIONS` by mistake fails `npm test` rather than silently
granting someone access.

---

## Legal note

Leave entitlements, working-hour limits and overtime rates differ between
Pakistan and the UAE. The portal supports per-office policy — weekends, leave
types, quotas — but it does not encode either country's law and makes no claim
to. Confirm the policies with your HR or legal advisor for each office. The
settings pages carry the same note where it matters.
