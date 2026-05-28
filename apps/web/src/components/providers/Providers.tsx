'use client';

// =============================================================================
// Providers — Client Component boundary untuk semua app-level providers
//
// Kenapa file ini terpisah dari layout.tsx:
// - layout.tsx adalah Server Component (wajib, untuk metadata export)
// - next/dynamic dengan ssr:false HARUS ada di dalam 'use client' component
// - Jika langsung di layout.tsx (Server Component), Next.js 15 error
//
// Kenapa ssr: false:
// - next-auth v4 tidak kompatibel dengan React 19 SSR
// - NextAuthSessionProvider menggunakan React 18 internal APIs
// - Saat static generation (e.g. /404 build time), SSR memicu React error #31
// - ssr: false → SessionProvider hanya di-mount client-side setelah hydration
// - Auth tetap aman: middleware.ts handles redirect ke /login
// =============================================================================

import dynamic from 'next/dynamic';

const SessionProvider = dynamic(
  () =>
    import('@/components/providers/SessionProvider').then((mod) => ({
      default: mod.SessionProvider,
    })),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
