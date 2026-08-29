import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { canAccessExecutiveDashboard } from './executive-authority';

export async function requireExecutiveDashboardAccess(): Promise<Session & { accessToken: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login');

  const authority = await resolveDashboardAuthority(session);
  if (!canAccessExecutiveDashboard(authority)) redirect('/dashboard');

  return session as Session & { accessToken: string };
}
