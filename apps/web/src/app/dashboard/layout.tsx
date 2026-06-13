import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import ViewAsBanner from '@/components/layout/ViewAsBanner';
import { DashboardProviders } from '@/components/providers/DashboardProviders';
import { getActiveViewAs } from '@/lib/view-as';
import { apiFetch } from '@/lib/api';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Double-check auth (middleware already guards this, belt-and-suspenders)
  if (!session) redirect('/login');

  const viewAs = await getActiveViewAs(session);

  // Ambil effective permissions dari backend
  const token = session.accessToken ?? '';
  const meData = await apiFetch<{ permissions: string[] }>('/auth/me', token);
  // meData === null berarti /auth/me GAGAL (401/5xx/network) — BUKAN "tanpa izin".
  // Tanpa pembedaan ini, sidebar runtuh ke menu kosong (hanya Beranda) saat fetch gagal.
  // permError = true → Sidebar masuk mode terbatas (filter role saja) alih-alih menyembunyikan semua.
  const permError = meData === null;
  const userPermissions: string[] = meData?.permissions ?? [];

  return (
    <DashboardProviders session={session}>
      <div className="flex flex-col md:flex-row h-full min-h-screen">
        <MobileNav viewAs={viewAs} permissions={userPermissions} permError={permError} />
        <Sidebar viewAs={viewAs} permissions={userPermissions} permError={permError} className="hidden md:flex" />
        <main className="flex-1 overflow-auto bg-gray-50">
          {viewAs && <ViewAsBanner viewAs={viewAs} />}
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </DashboardProviders>
  );
}
