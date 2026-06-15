import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import KalenderClient from './_components/KalenderClient';

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
  const roles: string[] = await getEffectiveRoles(session);
  if (!EDITORS.some((r) => roles.includes(r))) redirect('/dashboard');

  const token = session?.accessToken ?? '';
  const [calendar, activeYear] = await Promise.all([
    apiFetch<CalendarEvent[]>('/school/calendar', token),
    apiFetch<{ id: string; code: string } | null>('/school/academic-years/active', token),
  ]);

  return (
    <KalenderClient
      events={Array.isArray(calendar) ? calendar : []}
      academicYear={activeYear && 'id' in (activeYear as object) ? (activeYear as { id: string; code: string }) : null}
    />
  );
}
