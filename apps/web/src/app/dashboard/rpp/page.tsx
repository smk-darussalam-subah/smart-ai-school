import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import RppBoard, { RppItem } from './_components/RppBoard';

interface ListResponse { data: RppItem[]; total: number; }
interface ActiveSemester { number: number; academicYear: { code: string } }

export default async function RppPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  // Halaman ini = REVIEW Modul Ajar (KS/SA/WAKA_KURIKULUM dengan permission rpp.review).
  // Pembuatan/edit Modul Ajar oleh GURU sudah satu pintu di Akademik → Pembelajaran
  // → Modul Ajar (hapus dualitas).
  //
  // W3-4 P2: Role-aware UI — WAKA_KURIKULUM dan KS tetap sama-sama dapat review+approve
  // via satu endpoint (one-step consistent), tetapi UI menyesuaikan label tombol
  // agar sesuai dengan kapasitas utama peran:
  //   - WAKA_KURIKULUM: label "Review" / "Minta Revisi" / "Setujui (delegasi KS)"
  //   - KEPALA_SEKOLAH: label "Setujui" / "Final Approval" / "Minta Revisi"
  //   - SUPER_ADMIN: setara KS
  // Audit trail juga mencatat role reviewer di reviewerName (service layer).
  const isReviewer = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'].some((r) => roles.includes(r));
  if (!isReviewer) redirect('/dashboard/akademik');

  // W3-4 P2: Determine primary reviewer role for UI customization.
  // Priority: SUPER_ADMIN > KEPALA_SEKOLAH > WAKA_KURIKULUM (matches service priority).
  const userRole = roles.find((r) => r === 'SUPER_ADMIN')
    ?? roles.find((r) => r === 'KEPALA_SEKOLAH')
    ?? roles.find((r) => r === 'WAKA_KURIKULUM')
    ?? null;

  const token = session.accessToken ?? '';
  const [res, semRes] = await Promise.all([
    apiFetch<ListResponse>('/rpp?limit=100', token),
    apiFetch<ActiveSemester>('/school/semesters/active', token),
  ]);

  return (
    <RppBoard
      items={res?.data ?? []}
      total={res?.total ?? 0}
      isGuru={false}
      isReviewer
      canDelete={roles.includes('SUPER_ADMIN')}
      userRole={userRole}
      defaultAcademicYear={semRes?.academicYear?.code ?? ''}
      defaultSemester={semRes?.number ?? 1}
    />
  );
}
