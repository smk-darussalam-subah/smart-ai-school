import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import { DashboardProviders } from '@/components/providers/DashboardProviders';
import { getActiveViewAs, getEffectiveRoles } from '@/lib/view-as';
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
  const roles = await getEffectiveRoles(session);

  // SISWA & ORANG_TUA dashboards are self-contained mobile-first apps with
  // native bottom navigation. Hide AppShell chrome (sidebar, mobile nav, top bar)
  // so only the workspace content is rendered.
  const hideChrome =
    (roles.includes('SISWA') || roles.includes('ORANG_TUA')) &&
    !roles.includes('GURU') &&
    !roles.includes('KEPALA_SEKOLAH');

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
      <AppShell viewAs={viewAs} permissions={userPermissions} permError={permError} hideChrome={hideChrome}>
        {children}
      </AppShell>
    </DashboardProviders>
  );
}
