'use client';

// =============================================================================
// PresensiGuru — check-in/out GPS (GURU) + rekap (staf & guru)
// (referensi KamilEdu Modul 8; desain: ui-ux-pro-max — status jelas, aksi besar,
// flag luar-area = ikon + teks, bukan warna saja)
// =============================================================================

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { checkIn, checkOut } from '../actions';

export interface AttendanceRecord {
  id: string;
  date: string;
  checkInAt: string;
  checkOutAt?: string | null;
  distanceInM?: number | null;
  outsideGeofence: boolean;
  notes?: string | null;
  teacher: { id: string; user: { fullName: string; staff?: { niy: string | null } | null } };
}

export interface TodayStatus {
  date: string;
  record: AttendanceRecord | null;
}

interface Props {
  isGuru: boolean;
  isStaf: boolean;
  today: TodayStatus | null;
  records: AttendanceRecord[];
  total: number;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

function getPosition(): Promise<{ lat?: number; lng?: number; geoError?: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ geoError: 'Perangkat tidak mendukung GPS' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => resolve({ geoError: `GPS gagal: ${err.message}` }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export default function PresensiGuru({ isGuru, isStaf, today, records, total }: Props) {
  const [error, setError] = useState('');
  const [geoWarn, setGeoWarn] = useState('');
  const [pending, startTransition] = useTransition();

  const record = today?.record ?? null;
  const sudahMasuk = !!record;
  const sudahPulang = !!record?.checkOutAt;

  const doAction = (type: 'in' | 'out') => {
    setError('');
    setGeoWarn('');
    startTransition(async () => {
      const pos = await getPosition();
      if (pos.geoError) {
        // Tetap kirim tanpa koordinat — server akan memberi flag "tak terverifikasi"
        setGeoWarn(`${pos.geoError} — presensi dikirim tanpa lokasi (akan diflag luar area).`);
      }
      const body = { lat: pos.lat, lng: pos.lng };
      const r = type === 'in' ? await checkIn(body) : await checkOut(body);
      if (!r.success) setError(r.error ?? 'Gagal');
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📍 Presensi Guru</h1>
        <p className="text-sm text-muted-foreground">
          Check-in/out dengan verifikasi lokasi (geofence sekolah).
        </p>
      </div>

      {isGuru && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hari Ini · {today?.date ?? ''}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                Masuk: <strong>{fmtTime(record?.checkInAt)}</strong>
              </span>
              <span>
                Pulang: <strong>{fmtTime(record?.checkOutAt)}</strong>
              </span>
              {record && (
                record.outsideGeofence ? (
                  <Badge variant="destructive">⚠ Luar Area{record.distanceInM != null ? ` (${record.distanceInM} m)` : ''}</Badge>
                ) : (
                  <Badge>✓ Dalam Area{record.distanceInM != null ? ` (${record.distanceInM} m)` : ''}</Badge>
                )
              )}
            </div>

            <div className="flex gap-2">
              {!sudahMasuk && (
                <Button size="lg" disabled={pending} onClick={() => doAction('in')}>
                  {pending ? 'Mengambil lokasi…' : '✓ Check-in Sekarang'}
                </Button>
              )}
              {sudahMasuk && !sudahPulang && (
                <Button size="lg" variant="outline" disabled={pending} onClick={() => doAction('out')}>
                  {pending ? 'Mengambil lokasi…' : 'Check-out'}
                </Button>
              )}
              {sudahPulang && (
                <p className="text-sm text-muted-foreground self-center">
                  Presensi hari ini lengkap. Terima kasih! 🎉
                </p>
              )}
            </div>

            {geoWarn && <p className="text-sm text-amber-600" role="status">{geoWarn}</p>}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Lokasi hanya dipakai untuk verifikasi radius sekolah dan disimpan pada
              catatan presensi Anda. Di luar radius tetap tercatat, dengan penanda.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isStaf ? `Rekap Presensi (${total})` : 'Riwayat Saya'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Belum ada data presensi.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  {isStaf && <TableHead>Guru</TableHead>}
                  <TableHead>Masuk</TableHead>
                  <TableHead>Pulang</TableHead>
                  <TableHead>Lokasi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                    {isStaf && (
                      <TableCell>
                        {r.teacher.user.fullName}
                        {r.teacher.user.staff?.niy ? <span className="text-muted-foreground"> · {r.teacher.user.staff.niy}</span> : null}
                      </TableCell>
                    )}
                    <TableCell>{fmtTime(r.checkInAt)}</TableCell>
                    <TableCell>{fmtTime(r.checkOutAt)}</TableCell>
                    <TableCell>
                      {r.outsideGeofence ? (
                        <Badge variant="destructive">⚠ Luar Area{r.distanceInM != null ? ` (${r.distanceInM} m)` : ''}</Badge>
                      ) : (
                        <Badge variant="outline">✓ Dalam Area{r.distanceInM != null ? ` (${r.distanceInM} m)` : ''}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
