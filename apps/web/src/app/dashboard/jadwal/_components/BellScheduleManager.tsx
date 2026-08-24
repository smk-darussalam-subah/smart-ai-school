'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Ban, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBellSchedule, revokeBellSchedule, updateBellSchedule } from '../actions';

type SegmentType = 'INSTRUCTION' | 'BREAK' | 'CEREMONY' | 'OTHER';

export interface BellScheduleProfile {
  id: string;
  code: string;
  name: string;
  kind: 'NORMAL' | 'RAMADAN' | 'EXAM' | 'SPECIAL';
  effectiveFrom: string;
  effectiveUntil: string | null;
  provenance: string;
  revokedAt: string | null;
  segments: Array<{
    id: string;
    jpNumber: number | null;
    label: string;
    type: SegmentType;
    startMinute: number;
    endMinute: number;
    sortOrder: number;
  }>;
}

interface SegmentDraft {
  key: string;
  label: string;
  type: SegmentType;
  jpNumber: string;
  start: string;
  end: string;
}

function timeToMinute(value: string) {
  const [hour = Number.NaN, minute = Number.NaN] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function minuteToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function bellSegmentProblem(segments: SegmentDraft[]): string | null {
  const normalized = segments
    .map((segment) => ({
      ...segment,
      startMinute: timeToMinute(segment.start),
      endMinute: timeToMinute(segment.end),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
  if (
    normalized.some(
      (segment) => !segment.start || !segment.end || segment.endMinute <= segment.startMinute,
    )
  ) {
    return 'Setiap segmen harus memiliki waktu selesai setelah waktu mulai.';
  }
  if (
    normalized.some(
      (segment, index) => index > 0 && segment.startMinute < normalized[index - 1]!.endMinute,
    )
  ) {
    return 'Rentang segmen bertumpuk. Sesuaikan waktu sebelum menyimpan.';
  }
  return null;
}

const initialSegments = (): SegmentDraft[] => [
  {
    key: crypto.randomUUID(),
    label: 'JP 1',
    type: 'INSTRUCTION',
    jpNumber: '1',
    start: '07:30',
    end: '08:10',
  },
  {
    key: crypto.randomUUID(),
    label: 'JP 2',
    type: 'INSTRUCTION',
    jpNumber: '2',
    start: '08:10',
    end: '08:50',
  },
];

export default function BellScheduleManager({
  profiles,
  canManage,
  loadError,
}: {
  profiles: BellScheduleProfile[];
  canManage: boolean;
  loadError: string | null;
}) {
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<BellScheduleProfile | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<BellScheduleProfile | null>(null);
  const [segments, setSegments] = useState<SegmentDraft[]>(initialSegments);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const problem = useMemo(() => bellSegmentProblem(segments), [segments]);

  async function create(formData: FormData) {
    if (inFlight.current || problem) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await createBellSchedule({
        code: String(formData.get('code') ?? '')
          .trim()
          .toUpperCase(),
        name: String(formData.get('name') ?? '').trim(),
        scope: 'SCHOOL',
        kind: String(formData.get('kind') ?? 'NORMAL'),
        effectiveFrom: String(formData.get('effectiveFrom') ?? ''),
        effectiveUntil: String(formData.get('effectiveUntil') ?? '').trim() || null,
        provenance: String(formData.get('provenance') ?? '').trim(),
        segments: segments.map((segment, index) => ({
          jpNumber: segment.type === 'INSTRUCTION' ? Number(segment.jpNumber) : null,
          label: segment.label.trim(),
          type: segment.type,
          startMinute: timeToMinute(segment.start),
          endMinute: timeToMinute(segment.end),
          sortOrder: index + 1,
        })),
      });
      if (result.success) {
        setMessage({
          tone: 'success',
          text: 'Profil bel tersimpan. Resolver akan memakai rentang efektif secara authoritative.',
        });
        setOpen(false);
        setSegments(initialSegments());
      } else {
        setMessage({ tone: 'error', text: result.error });
      }
    } catch {
      setMessage({
        tone: 'error',
        text: 'Profil bel belum tersimpan. Periksa koneksi lalu coba lagi.',
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function revoke() {
    if (!confirmRevoke || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await revokeBellSchedule(confirmRevoke.id);
      setMessage(
        result.success
          ? {
              tone: 'success',
              text: 'Profil bel dicabut. Sesi yang sudah tersnapshot tidak diubah.',
            }
          : { tone: 'error', text: result.error },
      );
      if (result.success) setConfirmRevoke(null);
    } catch {
      setMessage({ tone: 'error', text: 'Profil bel belum dapat dicabut.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function update(formData: FormData) {
    if (!editProfile || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateBellSchedule(editProfile.id, {
        name: String(formData.get('name') ?? '').trim(),
        kind: String(formData.get('kind') ?? editProfile.kind),
        effectiveFrom: String(formData.get('effectiveFrom') ?? ''),
        effectiveUntil: String(formData.get('effectiveUntil') ?? '').trim() || null,
        provenance: String(formData.get('provenance') ?? '').trim(),
      });
      setMessage(
        result.success
          ? {
              tone: 'success',
              text: 'Rentang efektif profil diperbarui. Snapshot sesi historis tetap immutable.',
            }
          : { tone: 'error', text: result.error },
      );
      if (result.success) setEditProfile(null);
    } catch {
      setMessage({ tone: 'error', text: 'Profil bel belum dapat diperbarui.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="bell-heading">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 id="bell-heading" className="font-bold text-slate-950">
            Bell Schedule
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Sumber waktu JP, Ramadan, ujian, dan hari khusus dalam zona Asia/Jakarta.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            size="icon"
            className="h-11 w-11"
            aria-label="Tambah profil bel"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={`mx-4 mt-4 rounded-md border px-3 py-2 text-sm ${message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}
        >
          {message.text}
        </p>
      )}
      {loadError ? (
        <p className="p-4 text-sm text-red-800">{loadError}</p>
      ) : profiles.length === 0 ? (
        <p className="p-4 text-sm text-slate-600">
          Belum ada profil Bell Schedule. Sesi baru akan fail-closed sampai profil authoritative
          tersedia.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">
                  {profile.name}{' '}
                  <span className="font-mono text-xs text-slate-500">{profile.code}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {profile.kind} · {profile.segments.length} segmen ·{' '}
                  {profile.effectiveFrom.slice(0, 10)} sampai{' '}
                  {profile.effectiveUntil?.slice(0, 10) ?? 'tanpa batas'} · {profile.provenance}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${profile.revokedAt ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}
                >
                  {profile.revokedAt ? 'Dicabut' : 'Berlaku'}
                </span>
                {canManage && !profile.revokedAt && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setEditProfile(profile)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Atur rentang
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 text-red-700"
                      onClick={() => setConfirmRevoke(profile)}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Cabut
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle>Tambah profil Bell Schedule</DialogTitle>
            <DialogDescription>
              Periksa rentang efektif dan susunan segmen. Overlap ditolak sebelum data dikirim.
            </DialogDescription>
          </DialogHeader>
          <form action={create} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="bell-code">Kode</Label>
                <Input
                  id="bell-code"
                  name="code"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="RAMADAN_2027"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-name">Nama profil</Label>
                <Input
                  id="bell-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Jadwal Ramadan 2027"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-kind">Jenis</Label>
                <select
                  id="bell-kind"
                  name="kind"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="RAMADAN">Ramadan</option>
                  <option value="EXAM">Ujian</option>
                  <option value="SPECIAL">Hari khusus</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-from">Mulai berlaku</Label>
                <Input id="bell-from" name="effectiveFrom" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-until">Selesai berlaku</Label>
                <Input id="bell-until" name="effectiveUntil" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-provenance">Dasar penetapan</Label>
                <Input
                  id="bell-provenance"
                  name="provenance"
                  required
                  minLength={3}
                  maxLength={255}
                  placeholder="SK Kepala Sekolah ..."
                />
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2">Jenis</th>
                    <th className="px-3 py-2">JP</th>
                    <th className="px-3 py-2">Mulai</th>
                    <th className="px-3 py-2">Selesai</th>
                    <th className="w-12 px-2">
                      <span className="sr-only">Hapus</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {segments.map((segment) => (
                    <tr key={segment.key}>
                      <td className="p-2">
                        <Input
                          aria-label="Label segmen"
                          value={segment.label}
                          onChange={(event) =>
                            setSegments((current) =>
                              current.map((item) =>
                                item.key === segment.key
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                        />
                      </td>
                      <td className="p-2">
                        <select
                          aria-label="Jenis segmen"
                          value={segment.type}
                          onChange={(event) =>
                            setSegments((current) =>
                              current.map((item) =>
                                item.key === segment.key
                                  ? { ...item, type: event.target.value as SegmentType }
                                  : item,
                              ),
                            )
                          }
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-2"
                        >
                          <option value="INSTRUCTION">Pembelajaran</option>
                          <option value="BREAK">Istirahat</option>
                          <option value="CEREMONY">Upacara</option>
                          <option value="OTHER">Lainnya</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label="Nomor JP"
                          type="number"
                          min={1}
                          max={16}
                          value={segment.jpNumber}
                          disabled={segment.type !== 'INSTRUCTION'}
                          onChange={(event) =>
                            setSegments((current) =>
                              current.map((item) =>
                                item.key === segment.key
                                  ? { ...item, jpNumber: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required={segment.type === 'INSTRUCTION'}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label="Waktu mulai"
                          type="time"
                          value={segment.start}
                          onChange={(event) =>
                            setSegments((current) =>
                              current.map((item) =>
                                item.key === segment.key
                                  ? { ...item, start: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label="Waktu selesai"
                          type="time"
                          value={segment.end}
                          onChange={(event) =>
                            setSegments((current) =>
                              current.map((item) =>
                                item.key === segment.key
                                  ? { ...item, end: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                        />
                      </td>
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-red-700"
                          aria-label={`Hapus ${segment.label}`}
                          disabled={segments.length === 1}
                          onClick={() =>
                            setSegments((current) =>
                              current.filter((item) => item.key !== segment.key),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() =>
                  setSegments((current) => [
                    ...current,
                    {
                      key: crypto.randomUUID(),
                      label: `JP ${current.length + 1}`,
                      type: 'INSTRUCTION',
                      jpNumber: String(current.length + 1),
                      start: current.at(-1)?.end ?? '07:30',
                      end: minuteToTime(
                        Math.min(timeToMinute(current.at(-1)?.end ?? '07:30') + 40, 1439),
                      ),
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Tambah segmen
              </Button>
              <p className={`text-sm ${problem ? 'text-red-700' : 'text-emerald-700'}`}>
                {problem ?? 'Rentang waktu tidak bertumpuk.'}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" className="min-h-11" disabled={pending || Boolean(problem)}>
                {pending ? 'Menyimpan…' : 'Simpan profil'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editProfile !== null}
        onOpenChange={(nextOpen: boolean) => !nextOpen && setEditProfile(null)}
      >
        <DialogContent className="max-w-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle>Atur rentang Bell Schedule</DialogTitle>
            <DialogDescription>
              Tutup rentang profil aktif sebelum menambahkan profil Ramadan, ujian, atau hari
              khusus. Server tetap menolak rentang yang bertumpuk.
            </DialogDescription>
          </DialogHeader>
          {editProfile && (
            <form action={update} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="bell-edit-name">Nama profil</Label>
                  <Input
                    id="bell-edit-name"
                    name="name"
                    defaultValue={editProfile.name}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bell-edit-kind">Jenis</Label>
                  <select
                    id="bell-edit-kind"
                    name="kind"
                    defaultValue={editProfile.kind}
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="RAMADAN">Ramadan</option>
                    <option value="EXAM">Ujian</option>
                    <option value="SPECIAL">Hari khusus</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bell-edit-from">Mulai berlaku</Label>
                  <Input
                    id="bell-edit-from"
                    name="effectiveFrom"
                    type="date"
                    defaultValue={editProfile.effectiveFrom.slice(0, 10)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bell-edit-until">Selesai berlaku</Label>
                  <Input
                    id="bell-edit-until"
                    name="effectiveUntil"
                    type="date"
                    defaultValue={editProfile.effectiveUntil?.slice(0, 10) ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bell-edit-provenance">Dasar penetapan</Label>
                  <Input
                    id="bell-edit-provenance"
                    name="provenance"
                    defaultValue={editProfile.provenance}
                    minLength={3}
                    maxLength={255}
                    required
                  />
                </div>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Susunan segmen tidak diubah dari dialog ini. Gunakan profil baru bila struktur JP
                berubah agar provenance tetap jelas.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setEditProfile(null)}
                >
                  Batal
                </Button>
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? 'Menyimpan…' : 'Simpan rentang'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmRevoke !== null}
        onOpenChange={(open: boolean) => !open && setConfirmRevoke(null)}
      >
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Cabut profil bel?</DialogTitle>
            <DialogDescription>
              Profil {confirmRevoke?.name} tidak dipakai untuk sesi baru. Snapshot sesi historis
              tetap immutable.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setConfirmRevoke(null)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              className="min-h-11 bg-red-700 hover:bg-red-800"
              disabled={pending}
              onClick={() => void revoke()}
            >
              Cabut profil
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
