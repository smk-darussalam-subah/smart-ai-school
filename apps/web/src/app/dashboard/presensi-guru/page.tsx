import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import AttendanceWorkspace from '@/components/attendance/AttendanceWorkspace';

export default async function PresensiGuruPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  const canRead = authority.can('staff.attendance.read');
  const canCheckIn = authority.can('staff.attendance.checkin');
  if (!canRead && !canCheckIn) redirect('/dashboard');
  return <AttendanceWorkspace canRead={canRead} canCheckIn={canCheckIn} canManage={authority.hasRole('SUPER_ADMIN') && authority.can('staff.attendance.manage')} />;
}
