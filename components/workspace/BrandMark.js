import Image from 'next/image';

/**
 * The portal's brand lockup: the LS mark, then the word "Workspace".
 *
 * The artwork (public/logo-for-workspace.png) is a transparent PNG in brand
 * blue and near-black navy, drawn for a white page: in light mode it is shown
 * exactly as drawn, and on the dark shell it is rendered in white, the same
 * treatment the public site gives the wordmark in its footer.
 */
export default function BrandMark({ size = 26, priority = false }) {
  return (
    <span className="ws-brand-mark">
      <Image
        src="/logo-for-workspace.png"
        alt="LYRASET"
        width={size}
        height={size}
        priority={priority}
        // The attributes above only fix the aspect ratio and reserve the space.
        // The drawn height is in rem, so the mark scales with the portal's root
        // font size instead of staying a fixed number of pixels.
        style={{ height: size / 16 + 'rem' }}
        // Local static asset: bypass the global Cloudinary loader, which
        // cannot width-optimize a /public file.
        unoptimized
        className="ws-brand-logo"
      />
      <span className="ws-brand-word">Workspace</span>
    </span>
  );
}
