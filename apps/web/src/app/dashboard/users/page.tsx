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

interface UserGroup {
  role: string;
  label: string;
  count: number;
  users: UserItem[];
}

interface PermissionItem {
  id: string;
  code: string;
  description: string;
  module: string;
}

interface Props {
  searchParams: Promise<{ search?: string }>;
}

export default async function UsersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('TATA_USAHA')) redirect('/dashboard');

  const token = session?.accessToken ?? '';
  const sp = await searchParams;

  const queryParams = new URLSearchParams();
  queryParams.set('limit', '50');
  if (sp.search) queryParams.set('search', sp.search);

  const [groupedData, permsData] = await Promise.all([
    apiFetch<{ groups: UserGroup[] }>(`/users/grouped?${queryParams.toString()}`, token),
    apiFetch<PermissionItem[]>('/permissions', token),
  ]);

  const groups = groupedData?.groups ?? [];
  let permissions: PermissionItem[] = [];
  if (Array.isArray(permsData)) {
    permissions = permsData;
  } else if (permsData && typeof permsData === 'object' && 'data' in permsData) {
    const d = (permsData as { data: unknown }).data;
    if (Array.isArray(d)) permissions = d as PermissionItem[];
  }

  return (
    <UsersClient
      initialGroups={groups}
      initialPermissions={permissions}
      isSuperAdmin={roles.includes('SUPER_ADMIN')}
    />
  );
}