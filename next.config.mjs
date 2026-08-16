import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build output directory. Defaults to .next; override with NEXT_DIST_DIR to
  // run a production build without touching the directory a running `next dev`
  // has open. Mixing the two leaves the dev server requiring chunks the build
  // replaced ("Cannot find module './5611.js'"). See `npm run build:check`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Lint is run explicitly via `npm run lint`; it does not gate production builds.
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Global custom loader: every <Image> is served through Cloudinary with
    // f_auto,q_auto + width-limited transforms. Local /public assets and
    // non-Cloudinary URLs are returned untouched by the loader.
    loader: 'custom',
    loaderFile: './lib/cloudinaryLoader.js',
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
  sassOptions: {
    quietDeps: true,
    silenceDeprecations: ['import', 'legacy-js-api', 'color-functions', 'global-builtin'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
