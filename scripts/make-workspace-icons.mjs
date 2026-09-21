/**
 * Regenerate the workspace PWA icons from public/favicon.png.
 *
 *   npx tsx scripts/make-workspace-icons.mjs
 *
 * Produces the two sizes Android and iOS ask for when the portal is installed
 * to a home screen:
 *
 *   public/ws-icons/icon-192.png
 *   public/ws-icons/icon-512.png
 *
 * They live outside /workspace on purpose: the middleware matcher covers
 * /workspace/:path*, and an icon a signed-out browser cannot fetch is no icon
 * at all.
 *
 * Both are drawn on the portal's own dark navy rather than left transparent:
 * a transparent icon composites to black on some launchers, which makes the
 * mark disappear. They are also padded, because a maskable icon is cropped to
 * whatever shape the launcher uses and an edge-to-edge mark loses its corners.
 *
 * Re-run this whenever public/favicon.png changes.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'public/favicon.png';
const OUT_DIR = 'public/ws-icons';
const BACKGROUND = { r: 7, g: 14, b: 33, alpha: 1 }; // --ws-bg #070e21
// The safe zone for a maskable icon is the middle 80%; 20% padding keeps the
// mark inside it whatever shape the launcher crops to.
const PADDING_RATIO = 0.2;

async function render(size) {
  const inner = Math.round(size * (1 - PADDING_RATIO * 2));
  const offset = Math.round((size - inner) / 2);

  const mark = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const out = OUT_DIR + '/icon-' + size + '.png';
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: mark, top: offset, left: offset }])
    .png()
    .toFile(out);

  console.log('  ' + out + '  ' + size + 'x' + size);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('Workspace PWA icons');
  await render(192);
  await render(512);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
