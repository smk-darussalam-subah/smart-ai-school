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
  const userPermissions: string[] = meData?.permissions ?? [];

  return (
    <DashboardProviders session={session}>
      <div className="flex flex-col md:flex-row h-full min-h-screen">
        <MobileNav viewAs={viewAs} permissions={userPermissions} />
        <Sidebar viewAs={viewAs} permissions={userPermissions} className="hidden md:flex" />
        <main className="flex-1 overflow-auto bg-gray-50">
          {viewAs && <ViewAsBanner viewAs={viewAs} />}
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </DashboardProviders>
  );
}
