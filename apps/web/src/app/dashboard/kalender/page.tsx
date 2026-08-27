import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetchResult } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import KalenderClient from './_components/KalenderClient';
import LoadError from '@/components/LoadError';
import { resolveCalendarScope } from './kalender-ui';

export interface CalendarEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: 'holiday' | 'exam' | 'event' | 'break';
  description: string | null;
}

const EDITORS = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'];

export default async function KalenderPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  if (!authority.can('academic.period.read') || !EDITORS.some((role) => authority.hasRole(role))) {
    redirect('/dashboard');
  }

  const token = session?.accessToken ?? '';
  const activeYearResult = await apiFetchResult<{ id: string; code: string } | null>('/school/academic-years/active', token);
  const scope = resolveCalendarScope(activeYearResult);
  const calendarResult = scope.query
    ? await apiFetchResult<CalendarEvent[]>('/school/calendar', token, scope.query)
    : null;

  if (calendarResult && calendarResult.status !== 'success') {
    return (
      <LoadError
        title="Kalender belum dapat dimuat"
        message={calendarResult.status === 'forbidden'
          ? 'Akses kalender ditolak untuk akun ini.'
          : calendarResult.message}
      />
    );
  }

  return (
    <KalenderClient
      events={calendarResult?.status === 'success' && Array.isArray(calendarResult.data) ? calendarResult.data : []}
      academicYear={scope.academicYear}
      periodWarning={scope.periodWarning}
    />
  );
}
