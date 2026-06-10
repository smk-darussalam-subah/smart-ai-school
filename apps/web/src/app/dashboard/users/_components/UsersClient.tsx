'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  updateUserRole,
  updateUserActive,
  grantUserPermission,
  revokeUserPermission,
  fetchUserOverrides,
} from '../actions';

const ROLES = [
  'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA',
  'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI',
] as const;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  KEPALA_SEKOLAH: 'bg-blue-100 text-blue-800',
  TATA_USAHA: 'bg-green-100 text-green-800',
  GURU: 'bg-orange-100 text-orange-800',
  SISWA: 'bg-sky-100 text-sky-800',
  ORANG_TUA: 'bg-pink-100 text-pink-800',
  INDUSTRI: 'bg-gray-100 text-gray-800',
};

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

interface UserPermission {
  permission: PermissionItem;
  grant: boolean;
}

interface Props {
  initialUsers: UserItem[];
  initialTotal: number;
  initialPermissions: PermissionItem[];
}

export default function UsersClient({ initialUsers, initialTotal, initialPermissions }: Props) {
  const router = useRouter();

  const [users] = useState<UserItem[]>(initialUsers);
  const [total] = useState(initialTotal);
  const [permissions] = useState<PermissionItem[]>(initialPermissions);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [overrideLoading, setOverrideLoading] = useState(false);

  const [actionMsg, setActionMsg] = useState('');

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    const params = new URLSearchParams({ page: '1', limit: '20', ...(value && { search: value }), ...(roleFilter && { role: roleFilter }) });
    router.push(`/dashboard/users?${params.toString()}`);
  };

  const handleRoleFilter = (value: string) => {
    const v = value === 'all' ? '' : value;
    setRoleFilter(v);
    setPage(1);
    const params = new URLSearchParams({ page: '1', limit: '20', ...(search && { search }), ...(v && { role: v }) });
    router.push(`/dashboard/users?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    const params = new URLSearchParams({ page: String(newPage), limit: '20', ...(search && { search }), ...(roleFilter && { role: roleFilter }) });
    router.push(`/dashboard/users?${params.toString()}`);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionMsg('');
    const result = await updateUserRole(userId, newRole);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg('Role berhasil diubah');
    router.refresh();
  };

  const handleToggleActive = async (userId: string, current: boolean) => {
    setActionMsg('');
    const result = await updateUserActive(userId, !current);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg(current ? 'User dinonaktifkan' : 'User diaktifkan');
    router.refresh();
  };

  const loadUserOverrides = async (userId: string) => {
    setOverrideLoading(true);
    const result = await fetchUserOverrides(userId);
    if (result.data) setUserPermissions(Array.isArray(result.data) ? result.data : []);
    else setUserPermissions([]);
    setOverrideLoading(false);
  };

  const handleOverride = async (userId: string, permissionId: string, grant: boolean) => {
    setActionMsg('');
    const result = await grantUserPermission(userId, permissionId, grant);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg(grant ? 'Permission diberikan' : 'Permission dicabut');
    loadUserOverrides(userId);
  };

  const handleRevokeOverride = async (userId: string, permissionId: string) => {
    setActionMsg('');
    const result = await revokeUserPermission(userId, permissionId);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg('Override dihapus');
    loadUserOverrides(userId);
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Manajemen User</h1>

      {actionMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg ${actionMsg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionMsg}
        </div>
      )}

      {/* ── User List ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daftar User ({total})</CardTitle>
          <div className="flex gap-2">
            <Input
              placeholder="Cari nama atau email..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-56 text-sm"
            />
            <Select value={roleFilter || 'all'} onValueChange={(v: string) => handleRoleFilter(v)}>
              <SelectTrigger className="w-40 text-sm">
                <SelectValue placeholder="Semua Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Role</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada user terdaftar.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[200px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.fullName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer ${ROLE_COLORS[u.role] || 'bg-gray-100'}`}>
                              {ROLE_LABELS[u.role] || u.role}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {ROLES.map((r) => (
                              <DropdownMenuItem
                                key={r}
                                onClick={() => handleRoleChange(u.id, r)}
                                disabled={r === u.role}
                              >
                                {ROLE_LABELS[r]} {r === u.role ? '(aktif)' : ''}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? 'default' : 'secondary'}>
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedUser(u.id); loadUserOverrides(u.id); }}
                          >
                            Permission
                          </Button>
                          <Button
                            size="sm"
                            variant={u.isActive ? 'destructive' : 'default'}
                            onClick={() => handleToggleActive(u.id, u.isActive)}
                          >
                            {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Halaman {page} dari {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
                      Sebelumnya
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
                      Berikutnya
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Permission Override per User ───────────────────────────────────── */}
      {selectedUser && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Permission Override — User</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Tutup</Button>
          </CardHeader>
          <CardContent>
            {overrideLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data override...</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {permissions.map((perm) => {
                  const override = userPermissions.find((up) => up.permission.id === perm.id);
                  const isGranted = override?.grant ?? false;
                  const isDenied = override && !override.grant;

                  return (
                    <div
                      key={perm.code}
                      className={`text-xs rounded-lg p-2 border cursor-pointer transition-colors ${
                        isGranted ? 'bg-green-50 border-green-300' :
                        isDenied ? 'bg-red-50 border-red-300' :
                        'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        if (isGranted || isDenied) {
                          handleRevokeOverride(selectedUser, perm.id);
                        } else {
                          handleOverride(selectedUser, perm.id, true);
                        }
                      }}
                    >
                      <code className="text-slate-700 font-mono">{perm.code}</code>
                      <p className="text-muted-foreground mt-0.5">{perm.module}</p>
                      {isGranted && <span className="text-green-600 font-medium">Granted</span>}
                      {isDenied && <span className="text-red-600 font-medium">Revoked</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Permission System ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Permission System</CardTitle></CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada permission terdaftar. Jalankan seed untuk menginisialisasi.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {permissions.map((p) => (
                <div key={p.code} className="text-xs bg-gray-50 rounded-lg p-2 border">
                  <code className="text-slate-700 font-mono">{p.code}</code>
                  <p className="text-muted-foreground mt-0.5">{p.module}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── API Endpoints ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>API Endpoints</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            { method: 'GET', path: '/api/v1/users', desc: 'List user (filter role, search, pagination)' },
            { method: 'GET', path: '/api/v1/users/:id', desc: 'Detail user' },
            { method: 'PATCH', path: '/api/v1/users/:id/role', desc: 'Ubah role user' },
            { method: 'PATCH', path: '/api/v1/users/:id/active', desc: 'Aktifkan/nonaktifkan user' },
            { method: 'GET', path: '/api/v1/permissions', desc: 'List permission' },
            { method: 'POST', path: '/api/v1/permissions', desc: 'Buat permission baru' },
            { method: 'GET', path: '/api/v1/permissions/roles/:role', desc: 'Permission per role' },
            { method: 'PUT', path: '/api/v1/permissions/roles/:role', desc: 'Set permission role' },
            { method: 'GET', path: '/api/v1/permissions/users/:userId', desc: 'Override per-user' },
            { method: 'POST', path: '/api/v1/permissions/users/:userId/grant', desc: 'Grant override' },
            { method: 'DELETE', path: '/api/v1/permissions/users/:userId/revoke', desc: 'Revoke override' },
          ].map((ep) => (
            <div key={ep.path} className="flex gap-3 items-start">
              <Badge variant={ep.method === 'GET' ? 'default' : ep.method === 'DELETE' ? 'destructive' : 'secondary'} className="font-mono text-xs shrink-0">{ep.method}</Badge>
              <code className="text-xs text-slate-700 shrink-0">{ep.path}</code>
              <span className="text-muted-foreground">{ep.desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
