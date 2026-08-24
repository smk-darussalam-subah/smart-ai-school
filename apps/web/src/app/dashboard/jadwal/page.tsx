import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetchResult } from '@/lib/api';
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
    apiFetchResult<ActiveSemester>('/school/semesters/active', token),
    apiFetchResult<AcademicYearItem[]>('/school/academic-years', token),
    canReadOptions
      ? apiFetchResult<ActiveOptions>('/teaching-assignments/options/active', token)
      : Promise.resolve(null),
  ]);

  if (activeSemesterRes.status === 'notFound') {
    return <AcademicDataNotice href="/dashboard/jadwal" message="Semester aktif belum disiapkan. Jadwal belum dapat ditentukan sebelum periode aktif tersedia." />;
  }
  if (activeSemesterRes.status !== 'success') {
    return <AcademicDataNotice href="/dashboard/jadwal" message={activeSemesterRes.message} />;
  }
  if (academicYearsRes.status !== 'success') {
    return <AcademicDataNotice href="/dashboard/jadwal" message={academicYearsRes.message} />;
  }

  const initialAcademicYear = activeSemesterRes.data?.academicYear?.code ?? '';
  const initialSemester = activeSemesterRes.data?.number;
  if (!initialAcademicYear || !initialSemester) {
    return <AcademicDataNotice href="/dashboard/jadwal" message="Konteks semester aktif tidak lengkap. Periksa konfigurasi periode akademik." />;
  }

  const query = new URLSearchParams({ page: '1', limit: '20', semester: String(initialSemester) });
  if (initialAcademicYear) query.set('academicYear', initialAcademicYear);
  const schedulesRes = await apiFetchResult<ListResponse>(`/schedules?${query.toString()}`, token);

  if (schedulesRes.status !== 'success') {
    return <AcademicDataNotice href="/dashboard/jadwal" message={schedulesRes.message || 'Jadwal belum dapat dimuat.'} />;
  }

  const optionWarning = canReadOptions && optionsRes?.status !== 'success'
    ? (optionsRes?.message ?? 'Pilihan kelas belum dapat dimuat. Jadwal tetap tersedia tanpa filter kelas.')
    : null;
  const options = canReadOptions && optionsRes?.status === 'success' ? optionsRes.data : null;

  return (
    <div className="space-y-4">
      {optionWarning && (
        <AcademicDataNotice
          href="/dashboard/jadwal"
          message={optionWarning}
        />
      )}
      <JadwalMatrix
        initialSchedules={schedulesRes.data.data}
        initialTotal={schedulesRes.data.total}
        initialPage={schedulesRes.data.page ?? 1}
        classes={options?.classes ?? []}
        academicYears={academicYearsRes.data}
        initialAcademicYear={initialAcademicYear}
        initialSemester={initialSemester}
        isStaff={isStaff}
        canManage={canManage}
      />
    </div>
  );
}
