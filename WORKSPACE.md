# LYRASET Workspace

The internal attendance portal at `/workspace`. It is part of this website,
not a separate application: one repository, one build, one `.env`, one database
connection, one Cloudinary account, one deployment.

The one thing that is kept apart is the browser bundle. A visitor reading a
case study never downloads the portal's JavaScript or stylesheets, because
none of it is imported by a public page — that is a page-weight decision, not a
separation of the codebase.

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

# Add the two workspace variables to the site's existing .env — see
# .env.example for what each one is. There is no separate portal env file.

npm run dev
```

Then create either demo data or a real Owner.

### Demo data (development)

This writes to whatever database `MONGODB_URI` in `.env` points at — the same
one the public site uses. Every demo record is marked `isSeedData`, so
`--clean` removes exactly those and nothing else. The passwords below are
published in the seed script, so remove them before real staff use the portal.

```bash
# Windows PowerShell
$env:WORKSPACE_ALLOW_SEED="true"; npm run seed:workspace -- --with-history

# macOS / Linux
WORKSPACE_ALLOW_SEED=true npm run seed:workspace -- --with-history
```

This creates the office (Islamabad), six departments, the
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
| Employee (Content, Islamabad, office)     | Mahnoor Siddiqui | `DEMO-104`  | `Demo@Mahnoor2026` | Yes       |

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
npm run test:live # 84 more against a running, seeded server
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
payroll locking, password reset, a forgotten clock-out being closed. It skips
itself if no server is reachable.

**It writes to the database** — it clocks demo accounts in and out, resets a
demo password and changes settings briefly. Run it against a copy, not the live
database. The simplest way, without a second env file, is to override the
connection for that one shell session:

```powershell
$env:MONGODB_URI = "mongodb+srv://.../lyraset_test?..."   # a scratch database
npm run dev          # in one terminal
npm run test:live    # in another, same override set
```

A variable set in the shell wins over `.env`, and disappears when the terminal
closes. The files run one at a time because they share the same demo accounts.

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
dashboard, the team sheet and the payroll export cannot disagree about whether
a day was late: they all call the same function.

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

### Pakistan time

The office is in Pakistan, so the whole portal runs on Pakistan time
(`Asia/Karachi`), for everyone. The zone is one constant, `TIMEZONE` in
`lib/workspace/timezone.js`; there is no per-person or per-office timezone to
set. Every timestamp is stored in UTC, and every work date, lateness check,
cycle boundary and displayed time is worked out in Pakistan time — never in the
server's zone (UTC on Vercel) or the viewer's browser zone, which disagree with
Pakistan about what "today" is between midnight and 05:00. Use
`todayInPakistan()` for today's date and `formatTime` / `formatDate` /
`formatDateTime` from `components/workspace/ui.js` for anything shown on screen.

A `workDate` is a plain `YYYY-MM-DD` string, not a `Date`, because it is a
calendar label: storing it as an instant would make "which day was this?"
depend on who is reading.

### The EOD and the clock-out are one action

Clicking Clock Out opens the report dialog; the clock-out is stamped when the
report is submitted, and both are written in one MongoDB transaction. Cancelling
leaves the employee clocked in with their draft intact (it autosaves to
`localStorage` per user and date). Where the deployment has no transactions —
a standalone mongod on a developer's machine — the EOD is removed again if the
clock-out fails.

---

## Nothing runs on a schedule

There are no cron jobs, no scheduled routes and nothing on a timer. The portal
deploys on a free Vercel account with nothing to configure, and there is no
background job that can quietly stop working without anyone noticing.

That works because everything a nightly job would have written is worked out
when it is read:

- **Absences.** A past working day with no clock-in and no approved leave reads
  as `ABSENT` wherever it appears — the team sheet, the drill-down, the
  absentees report. The status engine derives it from the shift and the record.
- **Sessions left open.** If someone forgets to clock out, the next time anyone
  loads the dashboard or clocks in, that session is closed at the shift end
  plus the Owner's offset — not at the time it happened to be noticed. This is
  what keeps the saved shift length honest: without it, one forgotten clock-out
  would record a twenty-hour day.
- **Leave carry-forward.** The next cycle's carry-in is computed from the
  previous one on demand.

Notifications are raised by things people do — a leave decision reaches the
employee the moment it is decided — so they need no scheduler either.

---

## Environment variables

**One `.env` for the whole site.** The portal is part of this website, not a
separate app: same repository, same build, same database connection, same
Cloudinary account, same `.env`. There is no portal-specific env file.

Documented in full in `.env.example`. The two variables the portal adds:

| Variable               | Required                | What it does                                                            |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `MONGODB_URI`          | yes                     | Shared with the CMS; the workspace adds `workspace_*` collections       |
| `WORKSPACE_JWT_SECRET` | yes                     | Signs the session cookie. 32 chars minimum, 48 random bytes recommended |
| `WORKSPACE_FIELD_KEY`  | if storing national IDs | AES-256-GCM key. Rotating it makes stored values unreadable             |
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

The portal lets the Owner set the weekend, leave types and quotas, but it does
not encode Pakistan's labour law and makes no claim to. Confirm leave
entitlements, working-hour limits and overtime rates with your HR or legal
advisor. The settings pages carry the same note where it matters.
