/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide Next.js dev indicator badge — dev-only indicator, tidak muncul di production build
  devIndicators: false,
  output: 'standalone',
  transpilePackages: ['@smk/auth', '@smk/logger', '@smk/types'],
  // output:'standalone' sets minimalMode on dev server, which disables /_next/image optimizer
  // and returns 400 for all local images. With unoptimized:true Next.js serves images
  // directly from /public — no /_next/image pipeline needed.
  // Our images are already well-optimized: baseline JPEG 163–265KB, sized correctly.
  images: {
    unoptimized: true,
  },
  // Wave 9: private documentation stays outside /public and is included explicitly
  // in the standalone server output for the authenticated streaming route.
  outputFileTracingIncludes: {
    '/api/help/artifacts/[id]': ['./private/help-artifacts/**/*'],
    '/api/help/screenshots/[id]': ['./private/help-screenshots/**/*'],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/offline.html',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

// Env-gated: withSentryConfig hanya aktif jika SENTRY_DSN tersedia.
// Tanpa DSN → ekspor nextConfig langsung (tidak ada overhead Sentry webpack plugin).
// Dengan DSN → wrap untuk source map support & error capture yang tepat.
const hasSentry = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (hasSentry) {
  const { withSentryConfig } = require('@sentry/nextjs');
  module.exports = withSentryConfig(nextConfig, {
    silent: true, // Tidak ada output CLI Sentry saat build
    // Tanpa org/project/authToken → source map upload di-skip secara otomatis.
    // Set SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN untuk mengaktifkan.
  });
} else {
  module.exports = nextConfig;
}
