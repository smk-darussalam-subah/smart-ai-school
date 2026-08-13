import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import JadwalMatrix, { type ScheduleItem } from './_components/JadwalMatrix';
import AcademicDataNotice from '../_components/AcademicDataNotice';

interface ListResponse {
  data: ScheduleItem[];
  total: number;
  page: number;
  limit: number;
}

interface ClassItem {
  id: string;
  name: string;
  grade: number;
}

interface AcademicYearItem {
  id: string;
  code: string;
  isActive: boolean;
}

interface ActiveSemester {
  number: number;
  academicYear: { code: string };
}

interface ActiveOptions {
  classes: ClassItem[];
}

export default async function JadwalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  const roles = authority.roles;
  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const token = session.accessToken ?? '';
  const isStaff = authority.hasRole(
    'SUPER_ADMIN',
    'KEPALA_SEKOLAH',
    'TATA_USAHA',
    'WAKA_KURIKULUM',
  );
  const canManage =
    authority.can('academic.schedule.manage') &&
    authority.hasRole('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM');
  const canReadOptions = isStaff && authority.can('academic.teaching.read');

  const [activeSemesterRes, academicYearsRes, optionsRes] = await Promise.all([
    apiFetch<ActiveSemester>('/school/semesters/active', token),
    apiFetch<AcademicYearItem[]>('/school/academic-years', token),
    canReadOptions
      ? apiFetch<ActiveOptions>('/teaching-assignments/options/active', token)
      : Promise.resolve(null),
  ]);
  const initialAcademicYear =
    activeSemesterRes?.academicYear.code ??
    academicYearsRes?.find((year) => year.isActive)?.code ??
    '';
  const initialSemester = activeSemesterRes?.number ?? 1;
  const query = new URLSearchParams({ page: '1', limit: '20', semester: String(initialSemester) });
  if (initialAcademicYear) query.set('academicYear', initialAcademicYear);
  const schedulesRes = await apiFetch<ListResponse>(`/schedules?${query.toString()}`, token);

  if (!schedulesRes) {
    return <AcademicDataNotice href="/dashboard/jadwal" message="Jadwal belum dapat dimuat." />;
  }

  return (
    <div className="space-y-4">
      {canReadOptions && !optionsRes && (
        <AcademicDataNotice
          href="/dashboard/jadwal"
          message="Pilihan kelas belum dapat dimuat. Jadwal tetap tersedia tanpa filter kelas."
        />
      )}
      <JadwalMatrix
        initialSchedules={schedulesRes.data}
        initialTotal={schedulesRes.total}
        initialPage={schedulesRes.page ?? 1}
        classes={optionsRes?.classes ?? []}
        academicYears={academicYearsRes ?? []}
        initialAcademicYear={initialAcademicYear}
        initialSemester={initialSemester}
        isStaff={isStaff}
        canManage={canManage}
      />
    </div>
  );
}
