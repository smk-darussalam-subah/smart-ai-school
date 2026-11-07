'use server';

import { getActionSession as getServerSession } from '@/lib/action-session';
import { authOptions } from '@/lib/auth';
import { apiFetchResult } from '@/lib/api';
import { readParentChildren } from '@/lib/parent-children';
import { fetchStudentTasks, fetchParentSpp } from '@/lib/learner-dashboard-server';
import type { DashboardRead } from '@/lib/learner-dashboard-read';
import type { SiswaTugas } from './_components/siswa/siswa-types';
import type { SppApiItem } from './_components/ortu/ortu-mappers';

/** Always use the current server session; callers cannot supply a token or an own-student ID. */
export async function refreshStudentTasks(): Promise<DashboardRead<SiswaTugas>> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.roles?.includes('SISWA')) return { state: 'denied' };
  return fetchStudentTasks(session.accessToken);
}

export async function refreshParentSpp(studentId: string): Promise<DashboardRead<SppApiItem>> {
  const session = await getServerSession(authOptions);
  if (
    !session?.accessToken ||
    !session.roles?.includes('ORANG_TUA') ||
    typeof studentId !== 'string' ||
    !studentId.trim()
  )
    return { state: 'denied' };
  const children = readParentChildren(
    await apiFetchResult<{ data: unknown }>('/students/my-children', session.accessToken),
  );
  if (children.state === 'error') return { state: 'unavailable' };
  if (!children.data.some((child) => child.id === studentId)) return { state: 'denied' };
  return fetchParentSpp(session.accessToken, [studentId]);
}
