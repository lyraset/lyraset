/* eslint-disable no-console */
/**
 * Non-destructive CMS sync.
 *
 *   npm run sync-pages
 *
 * Unlike `npm run seed`, this NEVER deletes or overwrites live content. It only
 * fills gaps, so it is safe to run against production:
 *
 *   - inserts Page documents for slugs that have no document yet (the five
 *     index pages that used to be hard-coded React: services, portfolio, team,
 *     careers, contact)
 *   - backfills SEO defaults for existing pages that predate the new fields
 *     (schemaType), leaving any value already set untouched
 *   - adds the new SeoDefault fields (localBusiness, schema switches,
 *     verification) to the singleton without touching existing values
 *
 * Re-running it is a no-op once everything is present.
 */
import mongoose from 'mongoose';

import Page from '../models/Page.js';
import SeoDefault from '../models/SeoDefault.js';
import pages from '../lib/seed/pages.js';
import seoDefault from '../lib/seed/seo.js';

/** Only ever set a key that is currently absent/empty. */
function fillMissing(target, source, keys) {
  const changes = [];
  for (const key of keys) {
    const current = target?.[key];
    const isEmpty =
      current === undefined ||
      current === null ||
      current === '' ||
      (Array.isArray(current) && current.length === 0) ||
      (typeof current === 'object' && !Array.isArray(current) && Object.keys(current).length === 0);
    if (isEmpty && source[key] !== undefined) {
      target[key] = source[key];
      changes.push(key);
    }
  }
  return changes;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('✖ MONGODB_URI is not set. Add it to .env first.');
    process.exit(1);
  }

  console.log('→ Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✔ Connected.\n');

  // ---- Pages ---------------------------------------------------------------
  let inserted = 0;
  let updated = 0;

  for (const seedPage of pages) {
    const existing = await Page.findOne({ slug: seedPage.slug });

    if (!existing) {
      await Page.create(seedPage);
      console.log(`  + created  /${seedPage.slug === 'home' ? '' : seedPage.slug}  (${seedPage.sections.length} sections)`);
      inserted += 1;
      continue;
    }

    // Page exists — never touch its sections or copy. Only backfill SEO keys
    // that the document has never had a value for.
    const seo = existing.seo || {};
    const changed = fillMissing(seo, seedPage.seo || {}, [
      'title',
      'description',
      'schemaType',
    ]);
    if (changed.length) {
      existing.seo = seo;
      await existing.save();
      console.log(`  ~ updated  /${existing.slug}  seo: ${changed.join(', ')}`);
      updated += 1;
    }
  }

  console.log(`\n✔ Pages: ${inserted} created, ${updated} backfilled, ${pages.length - inserted - updated} already current.`);

  // ---- SEO defaults --------------------------------------------------------
  // Read raw (.lean) rather than hydrating: Mongoose materialises nested-path
  // defaults on a hydrated document, which makes every new field *look* present
  // and skips the backfill — while the public site reads through .lean(), where
  // defaults are not applied and the fields are genuinely absent.
  const raw = await SeoDefault.findOne({ key: 'singleton' }).lean();

  if (!raw) {
    await SeoDefault.create(seoDefault);
    console.log('✔ SEO defaults: created.');
  } else {
    const $set = {};
    const isBlank = (v) =>
      v === undefined ||
      v === null ||
      v === '' ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

    for (const key of ['defaultKeywords', 'verification', 'localBusiness', 'structuredData']) {
      if (isBlank(raw[key])) $set[key] = seoDefault[key];
    }
    for (const key of ['description', 'employeeCount', 'url']) {
      if (isBlank(raw.organization?.[key])) $set[`organization.${key}`] = seoDefault.organization[key];
    }

    if (Object.keys($set).length) {
      await SeoDefault.updateOne({ key: 'singleton' }, { $set });
      console.log(`✔ SEO defaults: backfilled ${Object.keys($set).join(', ')}.`);
    } else {
      console.log('✔ SEO defaults: already current.');
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Sync complete. Nothing was deleted.');
  process.exit(0);
}

main().catch((err) => {
  console.error('✖ Sync failed:', err);
  process.exit(1);
});
