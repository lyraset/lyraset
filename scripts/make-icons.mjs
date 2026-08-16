/**
 * Regenerate the app icons from public/favicon.png.
 *
 *   npm run icons
 *
 * Produces two files that Next.js picks up automatically (App Router
 * convention — no <link> tags or metadata config needed):
 *
 *   app/icon.png        512×512, rounded corners (transparent outside the radius)
 *   app/apple-icon.png  512×512, square and fully opaque
 *
 * apple-icon is deliberately NOT rounded: iOS applies its own squircle mask to
 * the home-screen icon, so pre-rounding double-rounds it, and transparent
 * corners composite to black there instead of showing through.
 *
 * Re-run this whenever public/favicon.png changes.
 */
import sharp from 'sharp';

const SRC = 'public/favicon.png';
const SIZE = 512;
// 22% ≈ the iOS/Android app-icon corner radius; reads as "rounded" at 16px
// without the mark itself looking clipped.
const RADIUS = Math.round(SIZE * 0.22);

const base = sharp(SRC).resize(SIZE, SIZE, { fit: 'cover' });

// Flatten onto the artwork's own near-white ground so the rounded corners cut
// against a solid colour rather than a semi-transparent edge.
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

const mask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`
);

// `dest-in` keeps the source pixels only where the mask is opaque, so
// everything outside the rounded rect becomes transparent.
await base
  .clone()
  .flatten({ background: BG })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toFile('app/icon.png');

await base.clone().flatten({ background: BG }).png().toFile('app/apple-icon.png');

console.log(`icons written from ${SRC} — app/icon.png (r=${RADIUS}), app/apple-icon.png (square)`);
