import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import ViewAsBanner from '@/components/layout/ViewAsBanner';
import { DashboardProviders } from '@/components/providers/DashboardProviders';
import { getActiveViewAs } from '@/lib/view-as';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Double-check auth (middleware already guards this, belt-and-suspenders)
  if (!session) redirect('/login');

  const viewAs = await getActiveViewAs(session);

  return (
    // SessionProvider di-mount di sini, bukan di root layout.
    // Rationale: halaman publik (/, /login, /404) tidak butuh session context,
    // jadi membatasi 'use client' boundary ke /dashboard/* menjaga halaman
    // publik tetap fully static. Session di-pass dari server untuk menghindari
    // loading flash dan extra round-trip ke /api/auth/session.
    <DashboardProviders session={session}>
      <div className="flex h-full min-h-screen">
        <Sidebar viewAs={viewAs} />
        <main className="flex-1 overflow-auto bg-gray-50">
          {viewAs && <ViewAsBanner viewAs={viewAs} />}
          <div className="p-6">{children}</div>
        </main>
      </div>
    </DashboardProviders>
  );
}
