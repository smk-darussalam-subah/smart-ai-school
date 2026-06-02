/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@smk/auth', '@smk/logger', '@smk/types'],
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.API_URL || 'http://localhost:3001'}/api/v1/:path*`,
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
