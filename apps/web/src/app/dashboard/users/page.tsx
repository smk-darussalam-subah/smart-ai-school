import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LoadError from '@/components/LoadError';
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

interface Props {
  searchParams: Promise<{ search?: string }>;
}

export default async function UsersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('TATA_USAHA')) redirect('/dashboard');

  const token = session?.accessToken ?? '';
  const sp = await searchParams;

  const queryParams = new URLSearchParams();
  queryParams.set('limit', '50');
  if (sp.search) queryParams.set('search', sp.search);

  // TF2-P0-NEW-1 (Opsi B): Hanya fetch /users/grouped di page-level. Fetch
  // /permissions dihapus karena SA-only — TU tidak punya akses dan akan
  // menyebabkan LoadError. Panel permissions di-load lazy oleh SUPER_ADMIN
  // saat klik tombol "Izin" (lihat UsersClient.tsx loadAllPermissions).
  const groupedData = await apiFetch<{ groups: UserGroup[] }>(`/users/grouped?${queryParams.toString()}`, token);
  if (groupedData === null) return <LoadError />;

  const groups = groupedData?.groups ?? [];

  return (
    <UsersClient
      initialGroups={groups}
      isSuperAdmin={roles.includes('SUPER_ADMIN')}
    />
  );
}
