import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetchResult } from '@/lib/api';
import LoadError from '@/components/LoadError';
import UsersClient from './_components/UsersClient';
import { isUserIdentityRoleOption } from './users-ui';

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserListResponse {
  data: UserItem[];
  total: number;
  page: number;
  limit: number;
}

// TF2-P0-NEW-1 (Opsi B): PermissionItem tetap didefinisikan di sini untuk type
// compatibility, tapi fetch `/permissions` dihapus dari page-level Promise.all.
// Alasan: TU diizinkan masuk page (users/page.tsx:41) tetapi `/permissions`
// di-guard `@Roles('SUPER_ADMIN')` class-level (permissions.controller.ts:30).
// Fetch SA-only di page-level menyebabkan TU selalu LoadError. Panel permission
// dimuat lazy hanya saat SUPER_ADMIN klik "Izin" via fetchUserOverrides.
export interface PermissionItem {
  id: string;
  code: string;
  description: string;
  module: string;
}

const PAGE_SIZE = 20;
interface Props {
  searchParams: Promise<{ search?: string; role?: string; status?: string; page?: string }>;
}

export default async function UsersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  const roles = authority.roles;
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('TATA_USAHA')) redirect('/dashboard');

  const token = session?.accessToken ?? '';
  const sp = await searchParams;
  const requestedRole = isUserIdentityRoleOption(sp.role) ? sp.role : '';
  const requestedStatus =
    sp.status === 'inactive' || sp.status === 'archived' ? sp.status : 'active';
  const effectiveStatus =
    requestedStatus === 'archived' && !roles.includes('SUPER_ADMIN') ? 'active' : requestedStatus;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(PAGE_SIZE));
  queryParams.set('page', String(page));
  if (sp.search?.trim()) queryParams.set('search', sp.search.trim());
  if (requestedRole) queryParams.set('role', requestedRole);
  queryParams.set('status', effectiveStatus);

  // TF2-P0-NEW-1 (Opsi B): Hanya fetch /users/grouped di page-level. Fetch
  // /permissions dihapus karena SA-only — TU tidak punya akses dan akan
  // menyebabkan LoadError. Panel permissions di-load lazy oleh SUPER_ADMIN
  // saat klik tombol "Izin" (lihat UsersClient.tsx loadAllPermissions).
  const usersResult = await apiFetchResult<UserListResponse>(
    `/users?${queryParams.toString()}`,
    token,
  );
  if (usersResult.status !== 'success') {
    return <LoadError title="Daftar pengguna belum dapat dimuat" message={usersResult.message} />;
  }

  return (
    <UsersClient
      users={usersResult.data.data}
      total={usersResult.data.total}
      page={usersResult.data.page ?? page}
      limit={usersResult.data.limit ?? PAGE_SIZE}
      query={{
        search: sp.search ?? '',
        role: requestedRole || 'all',
        status: effectiveStatus,
      }}
      isSuperAdmin={roles.includes('SUPER_ADMIN')}
      canManageUsers={
        authority.can('user.manage') &&
        (roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA'))
      }
      canArchiveUsers={authority.can('user.manage') && roles.includes('SUPER_ADMIN')}
    />
  );
}
