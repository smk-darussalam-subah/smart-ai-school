import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import { DashboardProviders } from '@/components/providers/DashboardProviders';
import { getActiveViewAs, getEffectiveRoles } from '@/lib/view-as';
import { apiFetch } from '@/lib/api';
import { HeartbeatProvider } from '@/components/HeartbeatProvider';
import { LoginEventRecorder } from '@/components/LoginEventRecorder';
import { CURRENT_CONSENT_VERSION } from '@/lib/constants';

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
  const [meData, posData] = await Promise.all([
    apiFetch<{ permissions: string[] }>('/auth/me', token),
    apiFetch<{ academicYear: unknown; positions: { position: { code: string; name: string } }[] }>('/positions/my-positions', token),
  ]);
  // R-24: Ekstrak kode jabatan aktif sebagai role tambahan untuk sidebar
  const positionRoles: string[] = (posData?.positions ?? []).map((p) => p.position.code);
  // meData === null berarti /auth/me GAGAL (401/5xx/network) — BUKAN "tanpa izin".
  // Tanpa pembedaan ini, sidebar runtuh ke menu kosong (hanya Beranda) saat fetch gagal.
  // permError = true → Sidebar masuk mode terbatas (filter role saja) alih-alih menyembunyikan semua.
  const permError = meData === null;
  const userPermissions: string[] = meData?.permissions ?? [];

  // ── PDP Consent check ─────────────────────────────────────────────────────
  // Checked from DB (via /auth/me) — NOT from JWT — so it's always fresh.
  // After user consents, the DB is updated, and the NEXT page load sees the
  // new consentVersion immediately (no JWT stale-data problem).
  const userConsentVersion = (meData as { consentVersion?: string | null } | null)?.consentVersion;
  if (!permError && (!userConsentVersion || userConsentVersion !== CURRENT_CONSENT_VERSION)) {
    redirect('/consent');
  }

  return (
    <DashboardProviders session={session}>
      <HeartbeatProvider>
        <LoginEventRecorder />
        <AppShell viewAs={viewAs} permissions={userPermissions} permError={permError} hideChrome={hideChrome} positionRoles={positionRoles}>
          {children}
        </AppShell>
      </HeartbeatProvider>
    </DashboardProviders>
  );
}
