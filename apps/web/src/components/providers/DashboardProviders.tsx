'use client';

// =============================================================================
// DashboardProviders — SessionProvider khusus untuk area /dashboard/*
//
// Kenapa di sini dan bukan di root layout:
// - next-auth v4 + React 19: NextAuthSessionProvider di root layout menyebabkan
//   React error #31 saat prerender /404 (static generation)
// - Solusi: mount SessionProvider hanya di bawah dashboard/layout.tsx yang
//   merupakan protected area — halaman publik (/, /login, /404) tidak
//   memerlukan SessionProvider sama sekali
//
// Passing session dari server:
// - dashboard/layout.tsx adalah Server Component yang memanggil getServerSession()
// - Session di-pass sebagai prop sehingga client tidak perlu fetch ulang
//   (menghindari waterfall dan flash of loading state)
// =============================================================================

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

export function DashboardProviders({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <NextAuthSessionProvider session={session} refetchInterval={5 * 60}>
      {children}
    </NextAuthSessionProvider>
  );
}
