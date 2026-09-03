import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const apiAction = jest.fn();
const revalidatePath = jest.fn();

jest.mock('@/lib/server-actions', () => ({
  apiAction: (...args: unknown[]) => apiAction(...args),
}));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/hooks/use-query-state', () => ({
  useQueryState: () => ({ setParams: jest.fn(), isPending: false }),
}));
jest.mock('@/components/ui/table-pagination', () => ({
  TablePagination: () => null,
}));
jest.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));
jest.mock('../app/dashboard/users/_components/AddUserDialog', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../app/dashboard/users/_components/UserAccessDialog', () => ({
  __esModule: true,
  default: () => null,
}));

import { archiveUserAction, restoreUserAction } from '../app/dashboard/users/actions';
import UsersClient from '../app/dashboard/users/_components/UsersClient';

const baseUser: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
} = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'synthetic@example.invalid',
  fullName: 'Pengguna Sintetis',
  phone: null,
  role: 'GURU',
  isActive: true,
  deletedAt: null,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

function renderUsers(
  status: 'active' | 'inactive' | 'archived',
  user = baseUser,
  isSuperAdmin = true,
) {
  return renderToStaticMarkup(
    React.createElement(UsersClient, {
      users: [user],
      total: 1,
      page: 1,
      limit: 20,
      query: { search: '', role: 'all', status },
      isSuperAdmin,
      canManageUsers: true,
      canArchiveUsers: isSuperAdmin,
    }),
  );
}

describe('Manajemen Pengguna archive/restore', () => {
  beforeEach(() => {
    apiAction.mockReset();
    revalidatePath.mockReset();
  });

  it('mengirim reason dan stale token, lalu refresh hanya setelah archive sukses', async () => {
    apiAction.mockResolvedValue({ data: { id: baseUser.id }, error: null });

    await archiveUserAction(baseUser.id, 'Rekonsiliasi akun ganda', baseUser.updatedAt);

    expect(apiAction).toHaveBeenCalledWith(`/users/${baseUser.id}/archive`, 'POST', {
      reason: 'Rekonsiliasi akun ganda',
      expectedUpdatedAt: baseUser.updatedAt,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/users');
  });

  it('mempertahankan error restore secara jujur tanpa refresh palsu', async () => {
    apiAction.mockResolvedValue({ data: null, error: 'Data berubah, muat ulang.' });

    const result = await restoreUserAction(
      baseUser.id,
      'Pemulihan telah disetujui',
      baseUser.updatedAt,
    );

    expect(result.error).toBe('Data berubah, muat ulang.');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('daftar aktif menampilkan arsip sebagai aksi terpisah dan menyembunyikan restore', () => {
    const html = renderUsers('active');

    expect(html).toContain('Arsipkan');
    expect(html).not.toContain('Pulihkan');
    expect(html).toContain('aria-label="Status pengguna"');
  });

  it('daftar arsip hanya menawarkan pemulihan dan tidak membocorkan panel izin', () => {
    const html = renderUsers('archived', {
      ...baseUser,
      isActive: false,
      deletedAt: '2026-09-03T01:00:00.000Z',
    });

    expect(html).toContain('Diarsipkan');
    expect(html).toContain('Pulihkan');
    expect(html).not.toContain('>Izin<');
    expect(html).not.toContain('Ubah role');
  });

  it('persona non-SA tidak melihat tab arsip maupun aksi lifecycle', () => {
    const html = renderUsers('active', baseUser, false);

    expect(html).not.toContain('Diarsipkan');
    expect(html).not.toContain('Arsipkan');
    expect(html).not.toContain('Pulihkan');
  });
});
