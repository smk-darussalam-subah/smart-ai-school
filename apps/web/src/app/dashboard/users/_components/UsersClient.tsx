'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TablePagination } from '@/components/ui/table-pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useQueryState } from '@/hooks/use-query-state';
import {
  updateUserRole,
  updateUserActive,
  grantUserPermission,
  revokeUserPermission,
  fetchUserOverrides,
  fetchEffectivePermissions,
  fetchPermissionCatalog,
} from '../actions';
import AddUserDialog from './AddUserDialog';
import UserAccessDialog from './UserAccessDialog';
import type { PermissionItem } from '../page';
import { USER_IDENTITY_ROLE_OPTIONS, USERS_SEARCH_DEBOUNCE_MS } from '../users-ui';

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

interface UserPermission {
  permission: PermissionItem;
  grant: boolean;
}

type ConfirmTarget =
  | { kind: 'role'; user: UserItem; nextRole: string }
  | { kind: 'active'; user: UserItem; nextActive: boolean };

interface Props {
  users: UserItem[];
  total: number;
  page: number;
  limit: number;
  query: { search: string; role: string; status: string };
  isSuperAdmin: boolean;
  canManageUsers: boolean;
}

function syncMessage(data: unknown, success: string): string {
  const pending = Boolean((data as { keycloakSyncPending?: boolean } | undefined)?.keycloakSyncPending);
  return pending
    ? `${success}. Sinkronisasi Keycloak tertunda; database sudah menjadi sumber kebenaran.`
    : success;
}

export default function UsersClient({
  users,
  total,
  page,
  limit,
  query,
  isSuperAdmin,
  canManageUsers,
}: Props) {
  const router = useRouter();
  const { setParams, isPending } = useQueryState();
  const requestSeq = useRef(0);
  const [search, setSearch] = useState(query.search);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [effectivePerms, setEffectivePerms] = useState<string[]>([]);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [tab, setTab] = useState<'override' | 'effective'>('effective');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [accessCheckUser, setAccessCheckUser] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmError, setConfirmError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const applySearch = (value: string) => {
    setSearch(value);
  };

  useEffect(() => {
    setSearch(query.search);
  }, [query.search]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === query.search.trim()) return;
    const timeout = window.setTimeout(() => {
      setParams({ search: normalized || null });
    }, USERS_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query.search, search, setParams]);

  const loadUserPermissions = async (user: UserItem) => {
    if (!isSuperAdmin) return;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setSelectedUser(user);
    setOverrideLoading(true);
    setPermissionError(null);
    setCatalogError(null);
    setUserPermissions([]);
    setEffectivePerms([]);

    if (!permissionsLoaded) {
      const catalogResult = await fetchPermissionCatalog();
      if (requestSeq.current !== seq) return;
      if (catalogResult.error) {
        setCatalogError(catalogResult.error);
        setPermissions([]);
      } else if (Array.isArray(catalogResult.data)) {
        setPermissions(catalogResult.data);
        setPermissionsLoaded(true);
      }
    }

    const [overrideResult, effectiveResult] = await Promise.all([
      fetchUserOverrides(user.id),
      fetchEffectivePermissions(user.id),
    ]);
    if (requestSeq.current !== seq) return;
    if (overrideResult.error || effectiveResult.error) {
      setPermissionError(overrideResult.error || effectiveResult.error || 'Gagal memuat izin');
      setOverrideLoading(false);
      return;
    }
    setUserPermissions(Array.isArray(overrideResult.data) ? overrideResult.data : []);
    const data = effectiveResult.data as { permissions?: string[] } | undefined;
    setEffectivePerms(data?.permissions ?? []);
    setOverrideLoading(false);
  };

  const confirmAction = async () => {
    if (!confirmTarget) return false;
    const actionKey = `${confirmTarget.kind}:${confirmTarget.user.id}`;
    if (busyAction) return false;
    setBusyAction(actionKey);
    setConfirmError('');
    setActionMsg('');
    setActionError('');
    try {
      if (confirmTarget.kind === 'role') {
        const result = await updateUserRole(confirmTarget.user.id, confirmTarget.nextRole);
        if (result.error) {
          setConfirmError(result.error);
          return false;
        }
        setActionMsg(syncMessage(result.data, 'Peran pengguna berhasil diubah'));
      } else {
        const result = await updateUserActive(confirmTarget.user.id, confirmTarget.nextActive);
        if (result.error) {
          setConfirmError(result.error);
          return false;
        }
        setActionMsg(syncMessage(result.data, confirmTarget.nextActive ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan'));
      }
      setConfirmTarget(null);
      router.refresh();
      return true;
    } finally {
      setBusyAction(null);
    }
  };

  const handleOverride = async (userId: string, permissionId: string, grant: boolean) => {
    setActionMsg('');
    setActionError('');
    const result = await grantUserPermission(userId, permissionId, grant);
    if (result.error) setActionError(result.error);
    else setActionMsg(grant ? 'Izin diberikan' : 'Izin dicabut');
    if (selectedUser) void loadUserPermissions(selectedUser);
  };

  const handleRevokeOverride = async (userId: string, permissionId: string) => {
    setActionMsg('');
    setActionError('');
    const result = await revokeUserPermission(userId, permissionId);
    if (result.error) setActionError(result.error);
    else setActionMsg('Penggantian izin dihapus');
    if (selectedUser) void loadUserPermissions(selectedUser);
  };

  const activeConfirm = confirmTarget?.kind === 'active' ? confirmTarget : null;
  const roleConfirm = confirmTarget?.kind === 'role' ? confirmTarget : null;
  const confirmTitle = roleConfirm ? 'Ubah role identitas?' : activeConfirm?.nextActive ? 'Aktifkan pengguna?' : 'Nonaktifkan pengguna?';
  const confirmDescription = roleConfirm
    ? `${roleConfirm.user.fullName} akan berubah dari ${ROLE_LABELS[roleConfirm.user.role] ?? roleConfirm.user.role} menjadi ${ROLE_LABELS[roleConfirm.nextRole] ?? roleConfirm.nextRole}. Perubahan role identitas dapat memengaruhi sesi dan akses.`
    : activeConfirm
      ? `${activeConfirm.user.fullName} akan ${activeConfirm.nextActive ? 'diaktifkan kembali' : 'dinonaktifkan'}. Perubahan status dapat memengaruhi akses masuk.`
      : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Pengguna</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} pengguna sesuai filter. Daftar ini dipaginasi dari server.
          </p>
        </div>
        <AddUserDialog isSuperAdmin={isSuperAdmin} />
      </div>

      {actionMsg && (
        <div role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          {actionMsg}
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          Gagal: {actionError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filter Pengguna</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
            <Input
              placeholder="Cari nama atau surel..."
              value={search}
              onChange={(e) => applySearch(e.target.value)}
              className="text-sm"
              aria-label="Cari pengguna"
            />
            <Select value={query.role} onValueChange={(value: string) => setParams({ role: value })}>
              <SelectTrigger aria-label="Filter role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua role</SelectItem>
                {USER_IDENTITY_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={query.status} onValueChange={(value: string) => setParams({ status: value })}>
              <SelectTrigger aria-label="Filter status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => router.refresh()} disabled={isPending}>
              <RefreshCw className="mr-2 h-4 w-4" /> Segarkan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengguna</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Surel</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[280px]">Tindakan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Tidak ada pengguna sesuai filter.
                    </TableCell>
                  </TableRow>
                ) : users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.fullName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={`min-h-10 rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100'}`}
                              aria-label={`Ubah role ${user.fullName}`}
                            >
                              {ROLE_LABELS[user.role] || user.role}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {USER_IDENTITY_ROLE_OPTIONS.map((role) => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() => setConfirmTarget({ kind: 'role', user, nextRole: role })}
                                disabled={role === user.role}
                              >
                                {ROLE_LABELS[role]} {role === user.role ? '(aktif)' : ''}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className={`inline-flex min-h-8 items-center rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100'}`}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {isSuperAdmin && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => void loadUserPermissions(user)}>
                              <ShieldCheck className="mr-1.5 h-4 w-4" /> Izin
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => setAccessCheckUser(user.id)}
                            >
                              <Briefcase className="h-3.5 w-3.5" /> Jabatan
                            </Button>
                          </>
                        )}
                        {canManageUsers && (
                          <Button
                            size="sm"
                            variant={user.isActive ? 'destructive' : 'default'}
                            disabled={busyAction === `active:${user.id}`}
                            onClick={() => setConfirmTarget({ kind: 'active', user, nextActive: !user.isActive })}
                          >
                            {busyAction === `active:${user.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                            {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination page={page} limit={limit} total={total} onPage={(nextPage) => setParams({ page: nextPage })} />
        </CardContent>
      </Card>

      <UserAccessDialog
        userId={accessCheckUser}
        onClose={() => setAccessCheckUser(null)}
      />

      {isSuperAdmin && selectedUser && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Izin Pengguna - {selectedUser.fullName}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={tab === 'effective' ? 'default' : 'outline'} onClick={() => setTab('effective')}>
                Izin Efektif
              </Button>
              <Button size="sm" variant={tab === 'override' ? 'default' : 'outline'} onClick={() => setTab('override')}>
                Penggantian Izin
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Tutup</Button>
            </div>
          </CardHeader>
          <CardContent>
            {catalogError && (
              <div role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-semibold">Katalog izin gagal dimuat: {catalogError}</p>
                <p className="mt-1 text-xs">Ini bukan katalog kosong. Coba muat ulang panel izin.</p>
              </div>
            )}
            {permissionError && !overrideLoading && (
              <div role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-semibold">Gagal memuat izin: {permissionError}</p>
                <p className="mt-1 text-xs">Ini bukan berarti pengguna tidak punya izin.</p>
              </div>
            )}
            {overrideLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data izin...</p>
            ) : tab === 'effective' ? (
              <div className="flex flex-wrap gap-2">
                {effectivePerms.length === 0 && !permissionError ? (
                  <p className="text-sm text-muted-foreground">Tidak ada izin efektif.</p>
                ) : (
                  effectivePerms.map((code) => (
                    <span key={code} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-mono text-xs text-blue-700">
                      {code}
                    </span>
                  ))
                )}
              </div>
            ) : catalogError ? null : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {permissions.map((perm) => {
                  const override = userPermissions.find((up) => up.permission.id === perm.id);
                  const isGranted = override?.grant ?? false;
                  const isDenied = override && !override.grant;
                  return (
                    <button
                      key={perm.code}
                      type="button"
                      className={`min-h-16 rounded-lg border p-2 text-left text-xs transition-colors ${
                        isGranted ? 'border-green-300 bg-green-50' :
                        isDenied ? 'border-red-300 bg-red-50' :
                        'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        if (isGranted || isDenied) {
                          void handleRevokeOverride(selectedUser.id, perm.id);
                        } else {
                          void handleOverride(selectedUser.id, perm.id, true);
                        }
                      }}
                    >
                      <code className="font-mono text-slate-700">{perm.code}</code>
                      <p className="mt-0.5 text-muted-foreground">{perm.module}</p>
                      {isGranted && <span className="font-medium text-green-600">Diberikan</span>}
                      {isDenied && <span className="font-medium text-red-600">Dicabut</span>}
                    </button>
                  );
                })}
                {permissions.length === 0 && !catalogError && (
                  <p className="text-sm text-muted-foreground">Katalog izin kosong.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmError('');
          }
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={roleConfirm ? 'Ubah role' : activeConfirm?.nextActive ? 'Aktifkan' : 'Nonaktifkan'}
        variant={activeConfirm?.nextActive ? 'warning' : 'danger'}
        error={confirmError}
        onConfirm={confirmAction}
      />
    </div>
  );
}
