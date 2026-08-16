import Image from 'next/image';

// Intrinsic aspect ratio of public/Logo.png (2172 × 724 = 3:1). If the artwork
// is ever re-exported at a different ratio, update this constant to match.
const RATIO = 3375 / 1125;

/**
 * LYRASET wordmark logo (public/Logo.png — transparent PNG).
 * The Cloudinary loader returns local /public assets untouched, so this is
 * served directly. On dark backgrounds pass `light` to render it white.
 *
 * @param {{ light?: boolean, height?: number, priority?: boolean }} props
 */
export default function Logo({ light = false, height = 30, priority = false }) {
  return (
    <Image
      src="/Logo.png"
      alt="LYRASET"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      // Local static asset — bypass the global Cloudinary loader (which can't
      // width-optimize a /public file) and serve it directly.
      unoptimized
      className={light ? 'site-logo site-logo--light' : 'site-logo'}
    />
  );
}
