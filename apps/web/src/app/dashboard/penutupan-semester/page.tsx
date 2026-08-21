import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import SemesterClosingClient from './_components/SemesterClosingClient';
import type { SemesterClosureSummary, SemesterReadiness } from './actions';
import { canCloseSemesterFromAuthority, canReadSemesterFinalReport } from './semester-closing-ui';

export default async function SemesterClosingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login?reason=session');

  const authority = await resolveDashboardAuthority(session);
  const canReadFinalReport = canReadSemesterFinalReport(authority);
  const canCloseSemester = canCloseSemesterFromAuthority(authority);

  const [readiness, closures] = await Promise.all([
    apiFetch<SemesterReadiness>('/semester-closing/readiness', session.accessToken),
    canReadFinalReport
      ? apiFetch<{ data: SemesterClosureSummary[] }>('/semester-closing/closures', session.accessToken)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <SemesterClosingClient
      initialReadiness={readiness}
      initialClosures={closures?.data ?? []}
      canReadFinalReport={canReadFinalReport}
      canCloseSemester={canCloseSemester}
    />
  );
}
