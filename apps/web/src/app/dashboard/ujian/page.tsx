import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { ExamWorkspace } from './ExamWorkspace';

export default async function ExamPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const auth = await resolveDashboardAuthority(session);
  if (!auth.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'GURU', 'TATA_USAHA', 'SISWA'))
    redirect('/dashboard');
  return <ExamWorkspace
    student={auth.hasRole('SISWA')}
    canAuthor={auth.hasRole('GURU') && auth.can('lms.own.manage')}
    canPlan={auth.hasRole('SUPER_ADMIN', 'WAKA_KURIKULUM') && auth.can('academic.schedule.edit')}
    day={new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date())}
  />;
}
