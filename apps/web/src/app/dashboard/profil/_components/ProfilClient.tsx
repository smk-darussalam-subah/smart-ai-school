'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SchoolProfile, MajorRow } from '../page';
import {
  updateProfileAction,
  createMajorAction,
  updateMajorAction,
  toggleMajorActiveAction,
} from '../actions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile: SchoolProfile | null;
  majors: MajorRow[];
  isSuperAdmin: boolean;
}

interface ProfileForm {
  name: string;
  npsn: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  headmasterName: string;
  headmasterNip: string;
  logoUrl: string;
  accreditation: string;
  latitude: string;
  longitude: string;
  geofenceRadiusM: string;
}

interface MajorForm {
  code: string;
  name: string;
  description: string;
}

const emptyProfileForm = (p: SchoolProfile | null): ProfileForm => ({
  name: p?.name ?? '',
  npsn: p?.npsn ?? '',
  address: p?.address ?? '',
  phone: p?.phone ?? '',
  email: p?.email ?? '',
  website: p?.website ?? '',
  headmasterName: p?.headmasterName ?? '',
  headmasterNip: p?.headmasterNip ?? '',
  logoUrl: p?.logoUrl ?? '',
  accreditation: p?.accreditation ?? '',
  latitude: p?.latitude?.toString() ?? '',
  longitude: p?.longitude?.toString() ?? '',
  geofenceRadiusM: p?.geofenceRadiusM?.toString() ?? '',
});

const emptyMajorForm: MajorForm = { code: '', name: '', description: '' };

const MAJOR_PAGE_SIZE = 8;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfilClient({ profile, majors, isSuperAdmin }: Props) {
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm(profile));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [majorsList, setMajorsList] = useState<MajorRow[]>(majors);
  const [majorModal, setMajorModal] = useState(false);
  const [majorEditing, setMajorEditing] = useState<MajorRow | null>(null);
  const [majorForm, setMajorForm] = useState<MajorForm>(emptyMajorForm);
  const [majorSaving, setMajorSaving] = useState(false);
  const [majorMsg, setMajorMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [majorPage, setMajorPage] = useState(1);

  // ── Profile handlers ──────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    const body: Record<string, unknown> = {
      name: profileForm.name,
      npsn: profileForm.npsn || null,
      address: profileForm.address || null,
      phone: profileForm.phone || null,
      email: profileForm.email || null,
      website: profileForm.website || null,
      headmasterName: profileForm.headmasterName || null,
      headmasterNip: profileForm.headmasterNip || null,
      logoUrl: profileForm.logoUrl || null,
      accreditation: profileForm.accreditation || null,
      latitude: profileForm.latitude ? Number(profileForm.latitude) : null,
      longitude: profileForm.longitude ? Number(profileForm.longitude) : null,
      geofenceRadiusM: profileForm.geofenceRadiusM ? Number(profileForm.geofenceRadiusM) : undefined,
    };
    const res = await updateProfileAction(body as Parameters<typeof updateProfileAction>[0]);
    setProfileSaving(false);
    if (res.error) {
      setProfileMsg({ type: 'error', text: res.error });
    } else {
      setProfileMsg({ type: 'success', text: 'Profil sekolah berhasil diperbarui.' });
    }
  };

  const pf = (k: keyof ProfileForm, v: string) => setProfileForm((p) => ({ ...p, [k]: v }));

  // ── Major handlers ─────────────────────────────────────────────────────────

  const openCreateMajor = () => {
    setMajorEditing(null);
    setMajorForm(emptyMajorForm);
    setMajorMsg(null);
    setMajorModal(true);
  };

  const openEditMajor = (m: MajorRow) => {
    setMajorEditing(m);
    setMajorForm({ code: m.code, name: m.name, description: m.description ?? '' });
    setMajorMsg(null);
    setMajorModal(true);
  };

  const handleSaveMajor = async () => {
    setMajorSaving(true);
    setMajorMsg(null);
    let res;
    if (majorEditing) {
      res = await updateMajorAction(majorEditing.id, {
        code: majorForm.code,
        name: majorForm.name,
        description: majorForm.description || null,
      });
    } else {
      res = await createMajorAction({
        code: majorForm.code,
        name: majorForm.name,
        description: majorForm.description || null,
      });
    }
    setMajorSaving(false);
    if (res.error) {
      setMajorMsg({ type: 'error', text: res.error });
    } else {
      setMajorModal(false);
      // Refresh majors list by reloading — revalidatePath handles it
      window.location.reload();
    }
  };

  const handleToggleMajor = async (m: MajorRow) => {
    const res = await toggleMajorActiveAction(m.id, !m.isActive);
    if (!res.error) {
      setMajorsList((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, isActive: !x.isActive } : x)),
      );
    }
  };

  const mf = (k: keyof MajorForm, v: string) => setMajorForm((p) => ({ ...p, [k]: v }));

  // Reset ke halaman 1 saat majorsList berubah (setelah CRUD)
  useEffect(() => { setMajorPage(1); }, [majorsList.length]);

  const paginatedMajors = majorsList.slice((majorPage - 1) * MAJOR_PAGE_SIZE, majorPage * MAJOR_PAGE_SIZE);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🏫 Profil Sekolah</h1>
      <p className="text-sm text-gray-500 -mt-2">
        Kelola identitas sekolah dan daftar jurusan.
      </p>

      {/* Section 1: Profil Sekolah */}
      <section className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Identitas Sekolah</h2>

        {!isSuperAdmin ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Anda hanya dapat melihat profil sekolah. Hanya <strong>Super Admin</strong> yang dapat mengubah.
          </div>
        ) : null}

        {!profile ? (
          <div className="text-center py-12 text-muted-foreground">
            Data profil sekolah belum tersedia.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pf-name">Nama Sekolah *</Label>
                <Input id="pf-name" value={profileForm.name} onChange={(e) => pf('name', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-npsn">NPSN</Label>
                <Input id="pf-npsn" value={profileForm.npsn} onChange={(e) => pf('npsn', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="pf-address">Alamat</Label>
                <Textarea id="pf-address" value={profileForm.address} onChange={(e) => pf('address', e.target.value)} disabled={!isSuperAdmin} rows={2} />
              </div>
              <div>
                <Label htmlFor="pf-phone">Telepon</Label>
                <Input id="pf-phone" value={profileForm.phone} onChange={(e) => pf('phone', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-email">Email</Label>
                <Input id="pf-email" type="email" value={profileForm.email} onChange={(e) => pf('email', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-website">Website</Label>
                <Input id="pf-website" value={profileForm.website} onChange={(e) => pf('website', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-logo">URL Logo</Label>
                <Input id="pf-logo" value={profileForm.logoUrl} onChange={(e) => pf('logoUrl', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-headmaster">Nama Kepala Sekolah</Label>
                <Input id="pf-headmaster" value={profileForm.headmasterName} onChange={(e) => pf('headmasterName', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-headmaster-nip">NIP Kepala Sekolah</Label>
                <Input id="pf-headmaster-nip" value={profileForm.headmasterNip} onChange={(e) => pf('headmasterNip', e.target.value)} disabled={!isSuperAdmin} />
              </div>
              <div>
                <Label htmlFor="pf-accreditation">Akreditasi</Label>
                <Input id="pf-accreditation" value={profileForm.accreditation} onChange={(e) => pf('accreditation', e.target.value)} disabled={!isSuperAdmin} placeholder="Contoh: A" />
              </div>
              {/* Geofence */}
              <div className="md:col-span-2 pt-2 border-t">
                <p className="text-sm font-medium text-gray-700 mb-2">Geofence Presensi (opsional)</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="pf-lat">Latitude</Label>
                    <Input id="pf-lat" value={profileForm.latitude} onChange={(e) => pf('latitude', e.target.value)} disabled={!isSuperAdmin} placeholder="-6.1234" />
                  </div>
                  <div>
                    <Label htmlFor="pf-lng">Longitude</Label>
                    <Input id="pf-lng" value={profileForm.longitude} onChange={(e) => pf('longitude', e.target.value)} disabled={!isSuperAdmin} placeholder="106.1234" />
                  </div>
                  <div>
                    <Label htmlFor="pf-radius">Radius (meter)</Label>
                    <Input id="pf-radius" value={profileForm.geofenceRadiusM} onChange={(e) => pf('geofenceRadiusM', e.target.value)} disabled={!isSuperAdmin} placeholder="100" />
                  </div>
                </div>
              </div>
            </div>

            {profileMsg && (
              <div className={`rounded-lg px-4 py-3 text-sm ${profileMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {profileMsg.text}
              </div>
            )}

            {isSuperAdmin && (
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveProfile} disabled={profileSaving} className="bg-smk-blue hover:bg-primary-700">
                  {profileSaving ? 'Menyimpan…' : 'Simpan Profil'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Section 2: Manajemen Jurusan */}
      <section className="rounded-xl border bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Daftar Jurusan</h2>
          {isSuperAdmin && (
            <Button onClick={openCreateMajor} size="sm">
              + Tambah Jurusan
            </Button>
          )}
        </div>

        {majorsList.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Belum ada jurusan terdaftar.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Kode</TableHead>
                  <TableHead>Nama Jurusan</TableHead>
                  <TableHead className="hidden md:table-cell">Deskripsi</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  {isSuperAdmin && <TableHead className="w-24">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMajors.map((m) => (
                  <TableRow key={m.id} className="hover:bg-gray-50">
                    <TableCell>
                      <span className="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">{m.code}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-gray-800">{m.name}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-gray-500 max-w-[250px] truncate">
                      {m.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleToggleMajor(m)}
                          className="cursor-pointer"
                        >
                          <Badge variant={m.isActive ? 'default' : 'secondary'} className={m.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                            {m.isActive ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant={m.isActive ? 'default' : 'secondary'} className={m.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                          {m.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      )}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => openEditMajor(m)}>
                          Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {majorsList.length > MAJOR_PAGE_SIZE && (
          <TablePagination page={majorPage} limit={MAJOR_PAGE_SIZE} total={majorsList.length} onPage={setMajorPage} />
        )}

        {/* Major CRUD Modal */}
        <Dialog open={majorModal} onOpenChange={setMajorModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{majorEditing ? 'Edit Jurusan' : 'Tambah Jurusan'}</DialogTitle>
              <DialogDescription>
                {majorEditing ? `Mengubah data jurusan ${majorEditing.code}.` : 'Isi data jurusan baru.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="mj-code">Kode *</Label>
                  <Input
                    id="mj-code"
                    value={majorForm.code}
                    onChange={(e) => mf('code', e.target.value)}
                    placeholder="TJKT"
                    maxLength={10}
                  />
                </div>
                <div>
                  <Label htmlFor="mj-name">Nama *</Label>
                  <Input
                    id="mj-name"
                    value={majorForm.name}
                    onChange={(e) => mf('name', e.target.value)}
                    placeholder="Teknik Jaringan Komputer"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="mj-desc">Deskripsi</Label>
                <Textarea
                  id="mj-desc"
                  value={majorForm.description}
                  onChange={(e) => mf('description', e.target.value)}
                  placeholder="Deskripsi singkat jurusan (opsional)"
                  rows={3}
                />
              </div>

              {majorMsg && (
                <div className={`rounded-lg px-4 py-3 text-sm ${majorMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {majorMsg.text}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setMajorModal(false)}>Batal</Button>
              <Button
                onClick={handleSaveMajor}
                disabled={majorSaving || !majorForm.code.trim() || !majorForm.name.trim()}
                className="bg-smk-blue hover:bg-primary-700"
              >
                {majorSaving ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}
