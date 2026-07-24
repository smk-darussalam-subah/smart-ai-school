'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Briefcase, Users, GraduationCap, ShieldCheck, CalendarDays, UserPlus, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { Position, Assignment, Major, StaffCandidate } from '../page';

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  STRUKTURAL: { label: 'Struktural', cls: 'bg-emerald-100 text-emerald-700' },
  FUNGSIONAL: { label: 'Fungsional', cls: 'bg-sky-100 text-sky-700' },
  TENDIK: { label: 'Tenaga Kependidikan', cls: 'bg-amber-100 text-amber-700' },
};
const CATEGORY_ORDER = ['STRUKTURAL', 'FUNGSIONAL', 'TENDIK'];
const APPOINTMENT_TRANSITION_MESSAGE =
  'Transisi appointment sedang berlangsung. Struktur organisasi sementara mode baca saja; penugasan jabatan baru atau pelepasan jabatan dilakukan setelah Appointment Governance Wave B aktif.';

interface Props {
  positions: Position[];
  academicYear: { id: string; code: string } | null;
  assignments: Assignment[];
  majors: Major[];
  staff: StaffCandidate[];
  staffLoadError?: boolean;
}

export default function StrukturClient({
  positions,
  academicYear,
  assignments,
}: Props) {
  const [target, setTarget] = useState<Position | null>(null);

  const nameById = useMemo(() => new Map(positions.map((p) => [p.id, p.name])), [positions]);
  const byPosition = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const arr = m.get(a.positionId) ?? [];
      arr.push(a);
      m.set(a.positionId, arr);
    }
    return m;
  }, [assignments]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Briefcase className="h-5 w-5" />
            </span>
            Struktur Organisasi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Katalog dan riwayat penanggung jawab jabatan. Perubahan penugasan sementara ditahan sampai Appointment Governance aktif.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <CalendarDays className="h-4 w-4" /> Tahun Ajaran {academicYear?.code ?? '-'}
          </span>
        </div>
      </div>

      {!academicYear && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Belum ada tahun ajaran aktif. Struktur organisasi hanya dapat dibaca.
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Mode baca saja selama transisi appointment.</p>
          <p className="mt-0.5 text-sky-700">
            Jabatan struktural bukan role akun Keycloak. Penetapan, pelepasan, kapasitas,
            dan persetujuan jabatan akan dikelola di Wave B.
          </p>
        </div>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = positions.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', CATEGORY_META[cat]?.cls)}>
                {CATEGORY_META[cat]?.label}
              </span>
              <span className="text-sm text-muted-foreground">{items.length} jabatan</span>
            </div>
            <div className="divide-y">
              {items.map((p) => {
                const list = byPosition.get(p.id) ?? [];
                return (
                  <div key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        {p.scopeType === 'MAJOR' && (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                            <GraduationCap className="h-3 w-3" /> per jurusan
                          </span>
                        )}
                        {p.parentId && (
                          <span className="text-[11px] text-muted-foreground">
                            di bawah {nameById.get(p.parentId) ?? '-'}
                          </span>
                        )}
                        {p._count.permissions > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                            <ShieldCheck className="h-3 w-3" /> {p._count.permissions} izin terdaftar
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {list.length === 0 ? (
                          <span className="text-sm text-muted-foreground">Belum ada penanggung jawab tercatat.</span>
                        ) : list.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm text-emerald-800"
                          >
                            <Users className="h-3.5 w-3.5" />
                            {a.staff.user.fullName}{a.major ? ` - ${a.major.code}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5"
                      onClick={() => setTarget(p)}
                    >
                      <UserPlus className="h-4 w-4" /> Lihat Status Transisi
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <Dialog open={!!target} onOpenChange={(open: boolean) => { if (!open) setTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Penugasan Jabatan Ditahan</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{target?.name}</p>
            <p>{APPOINTMENT_TRANSITION_MESSAGE}</p>
            <p>
              Kandidat pegawai untuk appointment berikutnya akan berasal dari role stabil
              <strong> Guru</strong> dan <strong>Tata Usaha</strong>, dengan persetujuan dan eksklusivitas
              yang ditetapkan di Wave B.
            </p>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTarget(null)}>Mengerti</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
