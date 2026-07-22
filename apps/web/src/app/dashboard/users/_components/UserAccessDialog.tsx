'use client';

// TF2-P1-2: Korelasi Users ↔ Struktur Organisasi.
//
// Sebelumnya: modul Users tidak menampilkan jabatan aktif atau izin efektif
// berdasarkan penugasan. Reviewer (self-critique 2026-07-21) menemukan bahwa
// endpoint /positions/access-check/:userId SUDAH ada di backend
// (positions.controller.ts:39-44, positions.service.ts:328-395), server action
// `accessCheckAction` SUDAH ada — tapi UI Users tidak mengonsumsinya. Fix ini
// memenuhi prinsip "backend sudah siap, UI tinggal konsumsi".

import { useEffect, useState } from 'react';
import { Loader2, Briefcase, ShieldCheck, KeyRound, Mail } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { accessCheckAction, type AccessCheckResult } from '../actions';

interface Props {
  userId: string | null;
  onClose: () => void;
}

export default function UserAccessDialog({ userId, onClose }: Props) {
  const [data, setData] = useState<AccessCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setData(null);
      setErrorMsg(null);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setData(null);
    accessCheckAction(userId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.data) {
        setData(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const open = userId !== null;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-emerald-700" />
            Jabatan &amp; Akses Efektif
          </DialogTitle>
          <DialogDescription>
            Korelasi penugasan jabatan aktif (tahun ajaran berjalan) dan izin
            efektif user. Sumber: <code>/positions/access-check/:userId</code> (R-25).
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat data akses...
          </div>
        )}

        {errorMsg && !loading && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Gagal memuat data akses: {errorMsg}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">
            {/* ── Info User ── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Info User
              </h3>
              <div className="rounded-lg border bg-slate-50/50 p-3 space-y-1.5 text-sm">
                <div className="font-semibold text-gray-900">{data.user.fullName}</div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{data.user.email}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Peran DB:</span>
                  <Badge variant="outline" className="font-mono">{data.user.dbRole}</Badge>
                </div>
              </div>
            </section>

            {/* ── Role Keycloak ── */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" /> Role Keycloak
              </h3>
              {data.keycloakRoles.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Tidak ada realm role Keycloak (atau gagal mengambil — lihat log server).
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.keycloakRoles.map((r) => (
                    <span
                      key={r}
                      className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[11px] font-mono text-purple-800"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* ── Jabatan Aktif Tahun Ini ── */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Jabatan Aktif Tahun Ini
              </h3>
              {data.activePositions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  User belum ditugaskan ke jabatan apapun di tahun ajaran aktif.
                  Tetapkan di modul Struktur Organisasi.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.activePositions.map((p, idx) => (
                    <li
                      key={`${p.code}-${idx}`}
                      className="flex items-start justify-between rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                      </div>
                      {p.major && (
                        <Badge variant="outline" className="text-[11px]">
                          {p.major.code} · {p.major.name}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Izin Efektif ── */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Izin Efektif
                <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                  {data.effectivePermissions.length}
                </span>
              </h3>
              {data.effectivePermissions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  User tidak memiliki izin efektif. Periksa konfigurasi role/permission.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border bg-slate-50/50 p-2">
                  <div className="flex flex-wrap gap-1">
                    {data.effectivePermissions.map((code) => (
                      <span
                        key={code}
                        className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-mono text-blue-700"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Izin efektif = role_permissions ∪ user_permission_overrides (grant=true).
                Izin dari jabatan aktif sudah diterapkan sebagai override.
              </p>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
