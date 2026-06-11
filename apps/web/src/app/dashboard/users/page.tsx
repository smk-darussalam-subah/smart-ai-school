import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import UsersClient from './_components/UsersClient';

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface PermissionItem {
  id: string;
  code: string;
  description: string;
  module: string;
}

interface Props {
  searchParams: Promise<{ search?: string; role?: string; page?: string }>;
}

export default async function UsersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN')) redirect('/dashboard');

  const token = session?.accessToken ?? '';
  const sp = await searchParams;

  const queryParams = new URLSearchParams();
  queryParams.set('page', sp.page || '1');
  queryParams.set('limit', '20');
  if (sp.search) queryParams.set('search', sp.search);
  if (sp.role) queryParams.set('role', sp.role);

  const [usersData, permsData] = await Promise.all([
    apiFetch<{ data: UserItem[]; total: number; page: number; limit: number }>(`/users?${queryParams.toString()}`, token),
    apiFetch<PermissionItem[]>('/permissions', token),
  ]);

  const users = usersData?.data ?? [];
  const total = usersData?.total ?? 0;
  let permissions: PermissionItem[] = [];
  if (Array.isArray(permsData)) {
    permissions = permsData;
  } else if (permsData && typeof permsData === 'object' && 'data' in permsData) {
    const d = (permsData as { data: unknown }).data;
    if (Array.isArray(d)) permissions = d as PermissionItem[];
  }

  return (
    <UsersClient
      initialUsers={users}
      initialTotal={total}
      initialPermissions={permissions}
    />
  );
}
