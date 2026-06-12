'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  fetchEffectivePermissions,
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

interface UserPermission {
  permission: PermissionItem;
  grant: boolean;
}

interface Props {
  initialGroups: UserGroup[];
  initialPermissions: PermissionItem[];
}

export default function UsersClient({ initialGroups, initialPermissions }: Props) {
  const router = useRouter();

  const [groups] = useState<UserGroup[]>(initialGroups);
  const [permissions] = useState<PermissionItem[]>(initialPermissions);
  const [search, setSearch] = useState('');

  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [effectivePerms, setEffectivePerms] = useState<string[]>([]);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [tab, setTab] = useState<'override' | 'effective'>('effective');

  const [actionMsg, setActionMsg] = useState('');

  const handleSearch = (value: string) => {
    setSearch(value);
    const params = new URLSearchParams({ ...(value && { search: value }) });
    router.push(`/dashboard/users?${params.toString()}`);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionMsg('');
    const result = await updateUserRole(userId, newRole);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg('Peran berhasil diubah');
    router.refresh();
  };

  const handleToggleActive = async (userId: string, current: boolean) => {
    setActionMsg('');
    const result = await updateUserActive(userId, !current);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg(current ? 'Pengguna dinonaktifkan' : 'Pengguna diaktifkan');
    router.refresh();
  };

  const loadUserPermissions = async (userId: string) => {
    setSelectedUser(userId);
    setOverrideLoading(true);
    const [overrideResult, effectiveResult] = await Promise.all([
      fetchUserOverrides(userId),
      fetchEffectivePermissions(userId),
    ]);
    if (overrideResult.data) setUserPermissions(Array.isArray(overrideResult.data) ? overrideResult.data : []);
    else setUserPermissions([]);
    if (effectiveResult.data) {
      const d = effectiveResult.data as { permissions: string[] };
      setEffectivePerms(d.permissions ?? []);
    } else {
      setEffectivePerms([]);
    }
    setOverrideLoading(false);
  };

  const handleOverride = async (userId: string, permissionId: string, grant: boolean) => {
    setActionMsg('');
    const result = await grantUserPermission(userId, permissionId, grant);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg(grant ? 'Izin diberikan' : 'Izin dicabut');
    loadUserPermissions(userId);
  };

  const handleRevokeOverride = async (userId: string, permissionId: string) => {
    setActionMsg('');
    const result = await revokeUserPermission(userId, permissionId);
    if (result.error) setActionMsg(`Gagal: ${result.error}`);
    else setActionMsg('Penggantian izin dihapus');
    loadUserPermissions(userId);
  };

  const toggleGroup = (role: string) => {
    setExpandedRole((prev) => (prev === role ? null : role));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Manajemen Pengguna</h1>

      {actionMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg ${actionMsg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionMsg}
        </div>
      )}

      {/* ── Pencarian ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daftar Pengguna per Peran</CardTitle>
          <div className="flex gap-2">
            <Input
              placeholder="Cari nama atau surel..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-56 text-sm"
            />
            <Button size="sm" variant="outline" onClick={() => router.refresh()}>
              Segarkan
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* ── Akordeon per Peran ─────────────────────────────────────────────── */}
      {groups.map((group) => (
        <Card key={group.role}>
          <button
            onClick={() => toggleGroup(group.role)}
            className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[group.role] || 'bg-gray-100'}`}>
                {ROLE_LABELS[group.role] || group.role}
              </span>
              <span className="text-sm text-gray-500">
                {group.count} pengguna
              </span>
            </div>
            <span className="text-gray-400 text-lg">
              {expandedRole === group.role ? '\u25B2' : '\u25BC'}
            </span>
          </button>

          {expandedRole === group.role && (
            <CardContent className="pt-0 pb-4">
              {group.users.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Belum ada pengguna dengan peran ini.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Surel</TableHead>
                      <TableHead>Peran</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[260px]">Tindakan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.users.map((u) => (
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
                              onClick={() => loadUserPermissions(u.id)}
                            >
                              Izin
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
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {/* ── Panel Izin Pengguna ──────────────────────────────────────────────── */}
      {selectedUser && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Izin Pengguna</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={tab === 'effective' ? 'default' : 'outline'}
                onClick={() => setTab('effective')}
              >
                Izin Efektif
              </Button>
              <Button
                size="sm"
                variant={tab === 'override' ? 'default' : 'outline'}
                onClick={() => setTab('override')}
              >
                Penggantian Izin
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Tutup</Button>
            </div>
          </CardHeader>
          <CardContent>
            {overrideLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data izin...</p>
            ) : tab === 'effective' ? (
              <div className="flex flex-wrap gap-2">
                {effectivePerms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada izin efektif.</p>
                ) : (
                  effectivePerms.map((code) => (
                    <span key={code} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 font-mono">
                      {code}
                    </span>
                  ))
                )}
              </div>
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
                      {isGranted && <span className="text-green-600 font-medium">Diberikan</span>}
                      {isDenied && <span className="text-red-600 font-medium">Dicabut</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Sistem Izin ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Sistem Izin</CardTitle></CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada izin terdaftar. Jalankan seed untuk menginisialisasi.</p>
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
    </div>
  );
}