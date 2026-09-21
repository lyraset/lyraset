# LYRASET — International Marketing Agency Website

A production, **fully CMS-driven** marketing website built with Next.js (App
Router), Bootstrap 5 (SCSS), MongoDB Atlas (Mongoose), Cloudinary, and NextAuth.
Every piece of public content — headlines, paragraphs, stats, images, videos,
services, case studies, team, testimonials, jobs, offices, socials, SEO tags —
is stored in the database and editable from `/admin` without touching code.

> **Runs out of the box.** With no `MONGODB_URI` configured, the public site
> renders from bundled seed content so you can develop immediately. Point it at
> an Atlas cluster and run the seed script to make everything editable.

The repository also contains the internal attendance and HR portal at
`/workspace` — clock in and out, end-of-day reports, leave, approvals, payroll
close. It shares this database and Cloudinary account but is otherwise separate:
no workspace code reaches a public page bundle. See **[WORKSPACE.md](WORKSPACE.md)**.

---

## Tech stack

| Concern         | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| Framework       | Next.js 15 (App Router, RSC), JavaScript                     |
| Styling         | Bootstrap 5 via **SCSS** (trimmed modules) + design tokens   |
| Database        | MongoDB Atlas + Mongoose                                     |
| Media           | Cloudinary (images, video, PDF) with signed uploads          |
| Auth            | NextAuth (Credentials, bcrypt, JWT sessions)                 |
| Animation       | Framer Motion + GSAP/ScrollTrigger (lazy, reduced-motion)    |
| Validation      | Zod                                                          |
| Deploy target   | Vercel (region `bom1`)                                       |

---

## Quick start

```bash
# 1. Install
npm install --legacy-peer-deps

# 2. Develop — works immediately from bundled seed content (no config needed)
npm run dev        # http://localhost:3000
```

To enable the database and CMS, create a **`.env`** file (gitignored) with the
variables listed in the [Deploy to Vercel](#deploy-to-vercel) table, then follow
the steps below.

### Enable the database + CMS

1. Create a **MongoDB Atlas** cluster, a database user, and allow-list your IP
   (or `0.0.0.0/0` for Vercel). Copy the `mongodb+srv://…` string into
   `MONGODB_URI` in `.env` (include a database name, e.g. `…mongodb.net/lyraset`).
2. Create a **Cloudinary** account. Copy the cloud name, API key, and API secret
   into the `CLOUDINARY_*` vars (and `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`).
3. Generate admin credentials:
   ```bash
   node scripts/hash-password.js "your-strong-password"
   # paste the printed ADMIN_PASSWORD_HASH into .env, set ADMIN_EMAIL
   ```
   `npm run seed` uses these to create the admin user in the database.
   Authentication is **DB-only** — the admin record lives in MongoDB, not env.
4. Set `NEXTAUTH_SECRET` (`openssl rand -base64 32`) and `REVALIDATE_SECRET`.
5. Seed the database with the full starter content:
   ```bash
   npm run seed
   ```
6. Visit `/admin/login` and sign in.

---

## Scripts

| Command            | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Local dev server                              |
| `npm run build`    | Production build                              |
| `npm run start`    | Serve the production build                    |
| `npm run seed`     | Seed MongoDB with starter content             |
| `npm run lint`     | ESLint                                        |
| `npm run format`   | Prettier                                      |
| `npm run analyze`  | Bundle analysis (`@next/bundle-analyzer`)     |

Workspace portal (see [WORKSPACE.md](WORKSPACE.md)):

| Command                   | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `npm test`                | Unit tests for RBAC and the calculation modules       |
| `npm run test:live`       | API, page and flow tests against a running server     |
| `npm run test:all`        | Both                                                  |
| `npm run seed:workspace`  | Demo accounts and data (needs `WORKSPACE_ALLOW_SEED`) |
| `npm run create-owner`    | Bootstrap the one real Owner account                  |
| `npm run icons:workspace` | Regenerate the portal's PWA icons                     |

---

## Project structure

```
app/            App Router routes
  (site)/       Public site (route group — shared navbar/footer chrome)
  admin/        Admin CMS (protected by middleware)
  api/          Route handlers (REST per entity + upload, leads, revalidate)
components/      Public UI components
  admin/        Admin-only UI components
lib/            db, auth, cloudinary, validation, motion tokens, data access
models/         Mongoose schemas
scripts/        seed + password hashing
styles/         globals.scss (Bootstrap build + tokens) + per-component SCSS
```

Environment variables are documented in the [Deploy to Vercel](#deploy-to-vercel)
table below. Create a gitignored `.env` file with those keys for local use.

---

## How "everything is editable" works

Nothing on the public site is hardcoded. Content flows:

```
Admin (/admin) ──PUT/POST──▶ /api/** ──▶ MongoDB ──▶ revalidateTag(...)
                                                          │
Public page (RSC) ◀── lib/data.js (unstable_cache tags) ◀─┘
```

- **Content lives in the database.** `lib/data.js` reads it in Server
  Components; every read is wrapped in `unstable_cache` with a tag (`services`,
  `pages`, …).
- **Saving from the CMS revalidates instantly.** Each mutating API route calls
  `revalidateTag`, so statically-rendered pages refresh within seconds.
- **Composable pages.** A `Page` is an ordered list of **section records**
  (`hero`, `statsBar`, `servicesGrid`, `processTimeline`, `testimonialSlider`,
  `richText`, …). The admin edits any field, toggles visibility, drags to
  reorder, and adds new section instances — all with zero code changes, via the
  schema-driven editor (`lib/admin/sectionSchemas.js`).
- **Seed fallback.** With no `MONGODB_URI`, `lib/data.js` and the admin list
  endpoints return the bundled seed content (`lib/seed/*`) so the site is fully
  browsable out of the box (read-only).

### Media

All images/video/PDF go to **Cloudinary** via server-**signed** direct uploads
(`/api/upload` → browser → Cloudinary), so the API secret never reaches the
client and large files never pass through the serverless function. `next/image`
uses a custom loader (`lib/cloudinaryLoader.js`) that appends `f_auto,q_auto` +
width-limited transforms to every image.

---

## Performance

- **SSG/ISR** for all public pages (`revalidate = 3600`) + on-demand
  revalidation from the CMS.
- **First-load JS ≈ 143 kB** (uncompressed) on every public page, under the
  170 kB budget. Framer-Motion sections (hero, stats, testimonials) are
  `next/dynamic`-split, so they lazy-load and never sit in first-load JS
  (verified: the home page is no heavier than a plain rich-text page).
- **Zero CLS:** every image renders in a fixed-ratio box (`MediaImage`); the
  hero image is `priority`.
- **Animations** are lazy (GSAP dynamically imported), compositor-only
  (transform/opacity), and every effect respects `prefers-reduced-motion` and
  disables heavy parallax/magnetic effects below 992 px.
- Trimmed Bootstrap SCSS build (only the modules used); per-component
  stylesheets in `/styles`.

Run `npm run analyze` for a bundle report.

---

## Accessibility

Semantic landmarks + skip link, keyboard-navigable menu/carousel, visible focus
rings, `aria-live` form feedback, required alt text on every media asset in the
CMS, and contrast-checked color tokens.

---

## SEO

- Metadata API wired to the CMS (`lib/metadata.js`); per-entity overrides on
  services, case studies, and jobs.
- `sitemap.xml` + `robots.txt` generated from published content.
- JSON-LD: `Organization` (both offices), `Service`, `JobPosting`,
  `BreadcrumbList`.
- Canonical URLs, OpenGraph + Twitter cards, human-readable slugs.

---

## Admin authentication (DB-managed)

Admin auth is **database-only** — the identity lives in the `AdminUser`
collection, verified with a bcrypt hash ([lib/auth.js](lib/auth.js)). There is
no environment-variable login fallback, so nothing about the admin account needs
to live in Vercel's runtime env.

Create or rotate the admin against whatever database `MONGODB_URI` points at:

```bash
npm run create-admin -- admin@yourdomain.com "your-strong-password"
```

Run it locally pointed at the **production** Atlas URI (put that URI in `.env`
first) to provision the live admin. `npm run seed` also creates one from
`ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` when those are set — but `create-admin` is
the tool for changing the password later without touching content.

---

## Deploy to Vercel

1. **Push to GitHub** (this repo). `vercel.json` pins the function region to
   **`bom1`** (Mumbai) for the Pakistan/Gulf audience.
2. **Import the repo** into Vercel (framework preset: Next.js — defaults are fine).
3. **Set environment variables** (Project → Settings → Environment Variables) for
   the **Production** (and Preview) environments:

   **Required at runtime:**

   | Variable | Notes |
   | --- | --- |
   | `MONGODB_URI` | Atlas SRV string incl. db name (`…mongodb.net/lyraset`); allow-list `0.0.0.0/0` in Atlas → Network Access |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` — **required**, admin auth 500s without it |
   | `NEXTAUTH_URL` | your production URL, e.g. `https://lyraset.com` |
   | `NEXT_PUBLIC_SITE_URL` | your production URL — canonical/OG/sitemap base (must be set at **build** time) |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | media uploads (server-only) |
   | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | exposed for the `next/image` loader |
   | `REVALIDATE_SECRET` | random string; protects `/api/revalidate` |

   **Optional (features no-op when unset):** `RESEND_API_KEY` + `LEAD_NOTIFY_EMAIL`
   (email notifications), `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_META_PIXEL_ID`.

   **Seed/admin provisioning only (not needed at runtime):** `ADMIN_EMAIL`,
   `ADMIN_PASSWORD_HASH`.

   > **Public URL:** `NEXT_PUBLIC_SITE_URL` drives `metadataBase`, canonical tags,
   > OpenGraph URLs, `sitemap.xml`, `robots.txt`, and JSON-LD. If it's ever unset,
   > the app falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`
   > ([lib/site.js](lib/site.js)) instead of `localhost`, so URLs are never broken
   > in production — but set it to your real domain for correct canonicals.

4. **Seed the database** once — locally, with `.env` pointed at the production
   Atlas URI: `npm run seed`, then `npm run create-admin -- <email> <password>`.
5. **Deploy**, then verify: a public page loads with correct absolute URLs in
   `view-source` (canonical/OG), `/admin/login` signs in, editing a service saves
   and the public page updates within seconds, an image upload lands in Cloudinary
   + the Media Library, and a contact-form submission appears in the Leads inbox.

> **Serverless-safe:** no runtime filesystem writes — uploads go straight to
> Cloudinary — so everything works on Vercel's serverless runtime.

---

## What was verified

`npm run build` is green (all routes compile/prerender). Runtime-smoke-tested in
production mode (`npm start`): every public page returns 200 with seeded content;
form validation, honeypot, and rate-limiting behave; admin API routes require
auth (401) and the login page renders; `sitemap.xml`/`robots.txt` emit correctly.
Full Lighthouse runs require a deployed URL with the database + Cloudinary
connected — run them post-deploy and record the numbers here.
