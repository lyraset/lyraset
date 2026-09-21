# LYRASET Workspace: RBAC and demo accounts

## 1. Install
```bash
npm i jose bcryptjs zod dotenv      # mongoose is already in the project
npm i -D tsx
```

## 2. Environment (.env.local and Vercel)
```
MONGODB_URI=...                      # existing
WORKSPACE_JWT_SECRET=<64+ random chars>   # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 3. Project assumptions
- Files sit at the project root (app/, lib/, models/, styles/). If you use src/, move them under src/.
- The `@/` alias maps to the project root (`jsconfig.json`: `"paths": { "@/*": ["./*"] }`).
- Bootstrap CSS is already loaded in the root layout.
- If the CMS already has a `middleware.js`, merge the workspace logic into it. Next.js 16+: rename to `proxy.js` and export `proxy`.
- Add `Disallow: /workspace` to robots and keep /workspace out of the sitemap.

## 4. Test the RBAC rules (no database needed)
```bash
npx tsx --test scripts/test-rbac.mjs
```

## 5. Seed demo accounts
Use a separate dev database if you can (for example `/lyraset_dev` in the URI).
```bash
WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs
```
Windows PowerShell: `$env:WORKSPACE_ALLOW_SEED="true"; npx tsx scripts/seed-workspace.mjs`

Before going live, delete them and create the real Owner:
```bash
WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --clean
npx tsx scripts/create-owner.mjs --name "Full Name" --email owner@lyraset.com --employee-id LYR-0001
```
Forgotten Owner password: `npx tsx scripts/create-owner.mjs --reset`

## 6. Security layers
1. Middleware: verifies the signed cookie, deny-by-default route map, blocks cross-origin POSTs, noindex/no-store headers.
2. Server guards (`requirePagePermission`, `requireApiPermission`): re-check the DB on every request (active, role, tokenVersion). This is the real enforcement; never rely on middleware alone.
3. UI: nav links are filtered by permission (cosmetic only).
4. Database: single-Owner unique index; CEO forced to `requiresAttendance: false`.

Every new page must be added to `lib/workspace/routeAccess.js` (otherwise it's denied) and must call a guard at the top.
