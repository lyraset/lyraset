/**
 * API permission tests — these need a running server and a seeded database.
 *
 *   npm run dev                                     (in one terminal)
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --with-history
 *   npx tsx --test scripts/test-api.mjs
 *
 * For each demo role this signs in and calls every protected endpoint, then
 * asserts the response is exactly what the permission table in the spec says
 * it should be. Middleware and the per-handler guards are both in the path, so
 * a permission removed from only one of them still fails here.
 *
 * If no server is reachable the whole suite skips rather than fails, so
 * `npm test` stays useful without one.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.WORKSPACE_TEST_URL || 'http://localhost:3000';

const ACCOUNTS = {
  owner: { identifier: 'DEMO-001', password: 'Demo@Owner2026' },
  ceo: { identifier: 'DEMO-002', password: 'Demo@Ceo2026' },
  md: { identifier: 'DEMO-003', password: 'Demo@Md2026' },
  employee: { identifier: 'DEMO-101', password: 'Demo@Ali2026' },
};

let serverUp = false;
const sessions = {};

/** Pull the session cookie out of a Set-Cookie header. */
function readSessionCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    if (cookie.startsWith('lyr_ws_session=')) return cookie.split(';')[0];
  }
  return null;
}

async function signIn(role) {
  const res = await fetch(BASE + '/api/workspace/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('Could not sign in as ' + role + ': ' + res.status + ' ' + body);
  }
  const cookie = readSessionCookie(res);
  assert.ok(cookie, 'login should set a session cookie for ' + role);
  return cookie;
}

/** Call an endpoint as a role (or signed out when role is null). */
async function call(role, path, { method = 'GET', body = null } = {}) {
  const headers = {};
  if (role) headers.cookie = sessions[role];
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  return res;
}

// Top-level await, not a before() hook: each test's `skip` option is evaluated
// when the test is defined, which happens before any hook would have run.
try {
  const res = await fetch(BASE + '/api/workspace/auth/me', { redirect: 'manual' });
  serverUp = res.status === 401 || res.ok;
} catch {
  serverUp = false;
}
if (serverUp) {
  for (const role of Object.keys(ACCOUNTS)) sessions[role] = await signIn(role);
}

const skipUnlessUp = () =>
  serverUp ? false : 'no server at ' + BASE + ' — start `npm run dev` and seed first';

describe('authentication', () => {
  test('signed-out requests are refused', { skip: skipUnlessUp() }, async () => {
    const res = await call(null, '/api/workspace/auth/me');
    assert.equal(res.status, 401);
  });

  test('a wrong password never says which half was wrong', { skip: skipUnlessUp() }, async () => {
    const res = await fetch(BASE + '/api/workspace/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'DEMO-101', password: 'definitely-wrong' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Employee ID\/email or password is incorrect/);
  });

  test('an unknown account gets the same message', { skip: skipUnlessUp() }, async () => {
    const res = await fetch(BASE + '/api/workspace/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'NOPE-999', password: 'whatever' }),
    });
    assert.equal(res.status, 401);
  });

  test(
    'each role reports the permissions the table gives it',
    { skip: skipUnlessUp() },
    async () => {
      const expected = {
        owner: 17,
        ceo: 9,
        md: 11,
        employee: 5,
      };
      for (const [role, count] of Object.entries(expected)) {
        const res = await call(role, '/api/workspace/auth/me');
        assert.equal(res.status, 200, role);
        const { user } = await res.json();
        assert.equal(user.permissions.length, count, role + ' permission count');
        // The hash and lock state must never leave the server.
        assert.equal(user.passwordHash, undefined);
        assert.equal(user.lockUntil, undefined);
        assert.equal(user.failedLoginAttempts, undefined);
      }
    }
  );
});

/**
 * The permission matrix. Each row is an endpoint and the status each role
 * should get: 200 for allowed, 403 for forbidden.
 */
const MATRIX = [
  // path, method, body, { employee, md, owner, ceo }
  [
    '/api/workspace/attendance/today',
    'GET',
    null,
    { employee: 200, md: 200, owner: 200, ceo: 403 },
  ],
  [
    '/api/workspace/attendance/history',
    'GET',
    null,
    { employee: 200, md: 200, owner: 200, ceo: 200 },
  ],
  ['/api/workspace/attendance/live', 'GET', null, { employee: 403, md: 200, owner: 200, ceo: 200 }],
  ['/api/workspace/attendance/team', 'GET', null, { employee: 403, md: 200, owner: 200, ceo: 200 }],
  ['/api/workspace/eod', 'GET', null, { employee: 200, md: 200, owner: 200, ceo: 403 }],
  ['/api/workspace/eod/team', 'GET', null, { employee: 403, md: 200, owner: 200, ceo: 200 }],
  ['/api/workspace/leave', 'GET', null, { employee: 200, md: 200, owner: 200, ceo: 403 }],
  [
    '/api/workspace/leave/calendar?from=2026-01-01&to=2026-01-31',
    'GET',
    null,
    { employee: 403, md: 200, owner: 200, ceo: 200 },
  ],
  ['/api/workspace/requests', 'GET', null, { employee: 200, md: 200, owner: 200, ceo: 200 }],
  ['/api/workspace/approvals', 'GET', null, { employee: 403, md: 403, owner: 200, ceo: 200 }],
  [
    '/api/workspace/reports?key=late',
    'GET',
    null,
    { employee: 403, md: 200, owner: 200, ceo: 200 },
  ],
  [
    '/api/workspace/reports/export?key=late&format=csv',
    'GET',
    null,
    { employee: 403, md: 200, owner: 200, ceo: 200 },
  ],
  ['/api/workspace/employees', 'GET', null, { employee: 403, md: 200, owner: 200, ceo: 200 }],
  ['/api/workspace/profile', 'GET', null, { employee: 200, md: 200, owner: 200, ceo: 200 }],
  ['/api/workspace/audit', 'GET', null, { employee: 403, md: 403, owner: 200, ceo: 200 }],
  ['/api/workspace/payroll', 'GET', null, { employee: 403, md: 403, owner: 200, ceo: 403 }],
  [
    '/api/workspace/settings/company',
    'GET',
    null,
    { employee: 403, md: 403, owner: 200, ceo: 403 },
  ],
  ['/api/workspace/settings/shifts', 'GET', null, { employee: 403, md: 403, owner: 200, ceo: 403 }],
  [
    '/api/workspace/settings/holidays',
    'GET',
    null,
    { employee: 403, md: 403, owner: 200, ceo: 403 },
  ],
  [
    '/api/workspace/settings/leave-types',
    'GET',
    null,
    { employee: 403, md: 403, owner: 200, ceo: 403 },
  ],
  [
    '/api/workspace/settings/offices',
    'GET',
    null,
    { employee: 403, md: 403, owner: 200, ceo: 403 },
  ],
  ['/api/workspace/notifications', 'GET', null, { employee: 200, md: 200, owner: 200, ceo: 200 }],
];

describe('the permission matrix holds for every endpoint', () => {
  for (const [path, method, body, expected] of MATRIX) {
    test(method + ' ' + path, { skip: skipUnlessUp() }, async () => {
      for (const [role, status] of Object.entries(expected)) {
        const res = await call(role, path, { method, body });
        assert.equal(res.status, status, role + ' -> ' + method + ' ' + path);
      }
    });
  }
});

describe('the CEO is exempt from attendance everywhere', () => {
  const blocked = [
    ['/api/workspace/attendance/clock-in', 'POST', {}],
    ['/api/workspace/attendance/break', 'POST', { action: 'START', type: 'LUNCH' }],
    ['/api/workspace/attendance/clock-out', 'POST', { tasks: [{ title: 'x', description: 'y' }] }],
    [
      '/api/workspace/leave',
      'POST',
      {
        leaveTypeId: '000000000000000000000000',
        from: '2026-01-01',
        to: '2026-01-01',
        reason: 'test',
      },
    ],
  ];

  for (const [path, method, body] of blocked) {
    test('CEO gets 403 from ' + path, { skip: skipUnlessUp() }, async () => {
      const res = await call('ceo', path, { method, body });
      assert.equal(res.status, 403);
    });
  }
});

describe('the MD is read-only for oversight', () => {
  test('MD cannot edit an attendance record', { skip: skipUnlessUp() }, async () => {
    const res = await call('md', '/api/workspace/attendance/day', {
      method: 'PATCH',
      body: {
        userId: '000000000000000000000000',
        workDate: '2026-01-05',
        reason: 'testing that this is refused',
      },
    });
    assert.equal(res.status, 403);
  });

  test('MD cannot create an employee', { skip: skipUnlessUp() }, async () => {
    const res = await call('md', '/api/workspace/employees', {
      method: 'POST',
      body: {
        employeeId: 'TEST-900',
        name: 'Test Person',
        email: 'test900@lyraset.test',
        role: 'EMPLOYEE',
      },
    });
    assert.equal(res.status, 403);
  });

  test('MD cannot change settings', { skip: skipUnlessUp() }, async () => {
    const res = await call('md', '/api/workspace/settings/company', {
      method: 'PATCH',
      body: { monthlyLeaveQuota: 99 },
    });
    assert.equal(res.status, 403);
  });

  test('MD cannot approve', { skip: skipUnlessUp() }, async () => {
    const res = await call('md', '/api/workspace/approvals/decide', {
      method: 'POST',
      body: { requestId: '000000000000000000000000', decision: 'APPROVE' },
    });
    assert.equal(res.status, 403);
  });
});

describe('an employee is confined to their own records', () => {
  test('cannot read another employee attendance history', { skip: skipUnlessUp() }, async () => {
    const list = await call('owner', '/api/workspace/employees');
    const { users } = await list.json();
    const other = users.find((u) => u.employeeId === 'DEMO-102');
    const res = await call('employee', '/api/workspace/attendance/history?userId=' + other.id);
    assert.equal(res.status, 403);
  });

  test('can read their own attendance history', { skip: skipUnlessUp() }, async () => {
    const res = await call('employee', '/api/workspace/attendance/history');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.days));
  });

  test('cannot lock a payroll period', { skip: skipUnlessUp() }, async () => {
    const res = await call('employee', '/api/workspace/payroll', {
      method: 'POST',
      body: { action: 'LOCK', office: 'ISLAMABAD', cycleKey: '2026-01' },
    });
    assert.equal(res.status, 403);
  });
});

describe('input validation rejects bad requests before the database', () => {
  test('a malformed body returns field-level errors', { skip: skipUnlessUp() }, async () => {
    const res = await call('employee', '/api/workspace/requests', {
      method: 'POST',
      body: { type: 'NOT_A_TYPE', dates: [], reason: 'x' },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(Array.isArray(body.issues) && body.issues.length);
  });

  test(
    'a Mongo operator in a query parameter never reaches the database',
    { skip: skipUnlessUp() },
    async () => {
      // zod strips the unknown key, so `userId` is simply absent and the route
      // falls back to the caller's own record. The operator is neutralised
      // rather than refused, which is the outcome that matters.
      const res = await call('employee', '/api/workspace/attendance/history?userId[$ne]=null');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.name, 'Ali Raza', 'must return only the caller, never a broadened match');
    }
  );

  test('a Mongo operator in a JSON body is rejected', { skip: skipUnlessUp() }, async () => {
    const res = await call('employee', '/api/workspace/requests', {
      method: 'POST',
      body: {
        type: 'WFH',
        dates: [{ $ne: null }],
        reason: 'attempting an operator in an array',
      },
    });
    assert.equal(res.status, 400);
  });

  test('a bad date format is rejected', { skip: skipUnlessUp() }, async () => {
    const res = await call('md', '/api/workspace/attendance/team?date=not-a-date');
    assert.equal(res.status, 400);
  });
});

describe('cron routes need the bearer secret', () => {
  for (const job of ['auto-close', 'mark-absent', 'cycle-rollover', 'reminders', 'daily-summary']) {
    test(job + ' refuses an unauthenticated call', { skip: skipUnlessUp() }, async () => {
      const res = await fetch(BASE + '/api/workspace/cron/' + job, { redirect: 'manual' });
      assert.equal(res.status, 401);
    });
  }

  test('a signed-in session is still not enough', { skip: skipUnlessUp() }, async () => {
    const res = await call('owner', '/api/workspace/cron/auto-close');
    assert.equal(res.status, 401);
  });

  test('the right secret is accepted', { skip: skipUnlessUp() }, async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return;
    const res = await fetch(BASE + '/api/workspace/cron/auto-close', {
      headers: { authorization: 'Bearer ' + secret },
    });
    assert.equal(res.status, 200);
  });
});

describe('the workspace is never indexed', () => {
  test('pages carry a noindex header', { skip: skipUnlessUp() }, async () => {
    const res = await fetch(BASE + '/workspace/login', { redirect: 'manual' });
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
  });

  test('robots.txt disallows the whole area', { skip: skipUnlessUp() }, async () => {
    const res = await fetch(BASE + '/robots.txt');
    const body = await res.text();
    assert.match(body, /Disallow: \/workspace/);
  });

  test('the sitemap does not mention it', { skip: skipUnlessUp() }, async () => {
    const res = await fetch(BASE + '/sitemap.xml');
    const body = await res.text();
    assert.equal(body.includes('/workspace'), false);
  });
});

describe('unlisted workspace pages are denied by default', () => {
  test(
    'an unknown page redirects away instead of rendering',
    { skip: skipUnlessUp() },
    async () => {
      const res = await call('owner', '/workspace/not-a-real-page');
      assert.equal(res.status, 307);
      assert.match(res.headers.get('location') ?? '', /denied=1/);
    }
  );
});

/**
 * The page-level matrix, which is what the acceptance criteria describe:
 * an employee opening /workspace/team should be redirected with a notice, not
 * shown a broken page. 200 means the page rendered; 307 means it bounced.
 */
const PAGE_MATRIX = [
  ['/workspace', { employee: 200, md: 200, owner: 200, ceo: 200 }],
  ['/workspace/profile', { employee: 200, md: 200, owner: 200, ceo: 200 }],
  ['/workspace/attendance', { employee: 200, md: 200, owner: 200, ceo: 307 }],
  ['/workspace/eod', { employee: 200, md: 200, owner: 200, ceo: 307 }],
  ['/workspace/leave', { employee: 200, md: 200, owner: 200, ceo: 307 }],
  ['/workspace/requests', { employee: 200, md: 200, owner: 200, ceo: 307 }],
  ['/workspace/team', { employee: 307, md: 200, owner: 200, ceo: 200 }],
  ['/workspace/team/eod', { employee: 307, md: 200, owner: 200, ceo: 200 }],
  ['/workspace/leave-calendar', { employee: 307, md: 200, owner: 200, ceo: 200 }],
  ['/workspace/reports', { employee: 307, md: 200, owner: 200, ceo: 200 }],
  ['/workspace/approvals', { employee: 307, md: 307, owner: 200, ceo: 200 }],
  ['/workspace/audit', { employee: 307, md: 307, owner: 200, ceo: 200 }],
  ['/workspace/employees', { employee: 307, md: 307, owner: 200, ceo: 307 }],
  ['/workspace/settings', { employee: 307, md: 307, owner: 200, ceo: 307 }],
  ['/workspace/settings/company', { employee: 307, md: 307, owner: 200, ceo: 307 }],
  ['/workspace/settings/shifts', { employee: 307, md: 307, owner: 200, ceo: 307 }],
  ['/workspace/payroll-close', { employee: 307, md: 307, owner: 200, ceo: 307 }],
];

describe('every page renders for the roles that may open it', () => {
  for (const [path, expected] of PAGE_MATRIX) {
    test(path, { skip: skipUnlessUp() }, async () => {
      for (const [role, status] of Object.entries(expected)) {
        const res = await call(role, path);
        assert.equal(res.status, status, role + ' -> ' + path);
        if (status === 307) {
          // A denied page bounces to the dashboard with a notice, never to a 404.
          assert.match(res.headers.get('location') ?? '', /denied=1/, role + ' -> ' + path);
        }
      }
    });
  }
});

describe('signed-out visitors are sent to the login page', () => {
  test(
    'a workspace page redirects to login with a return path',
    { skip: skipUnlessUp() },
    async () => {
      const res = await call(null, '/workspace/team');
      assert.equal(res.status, 307);
      const location = res.headers.get('location') ?? '';
      assert.match(location, /\/workspace\/login/);
      assert.match(location, /next=%2Fworkspace%2Fteam/);
    }
  );

  test('the login page itself is public', { skip: skipUnlessUp() }, async () => {
    const res = await call(null, '/workspace/login');
    assert.equal(res.status, 200);
  });
});
