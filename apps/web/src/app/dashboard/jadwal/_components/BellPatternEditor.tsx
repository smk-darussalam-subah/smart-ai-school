'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, Clock3, Copy, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createBellSchedule, revokeBellSchedule, updateBellSchedule } from '../actions';
import { fmtMin, wibTodayISO } from '@/lib/bell-times';
import {
  SCHOOL_DAYS,
  normalizeDay,
  patternProblem,
  segmentsForDay,
  type BellProfile,
  type BellSegment,
} from '@/lib/bell-patterns';

const minute = (time: string) => {
  const [hour, min] = time.split(':').map(Number);
  return hour! * 60 + min!;
};
const field =
  'h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
export default function BellPatternEditor({
  profiles,
  canManage,
  loadError,
  previewSave,
}: {
  profiles: BellProfile[];
  canManage: boolean;
  loadError: string | null;
  previewSave?: (profile: BellProfile) => Promise<void>;
}) {
  const [selected, setSelected] = useState(profiles[0]?.id ?? 'new');
  const original = profiles.find((profile) => profile.id === selected) ?? null;
  const [day, setDay] = useState(1);
  const [draft, setDraft] = useState<BellSegment[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [from, setFrom] = useState(wibTodayISO());
  const [until, setUntil] = useState('');
  const [kind, setKind] = useState<BellProfile['kind']>('NORMAL');
  const [reason, setReason] = useState('');
  const [count, setCount] = useState(10);
  const [duration, setDuration] = useState(40);
  const [start, setStart] = useState('07:00');
  const [breakAfter, setBreakAfter] = useState(3);
  const [breakDuration, setBreakDuration] = useState(15);
  const [confirm, setConfirm] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDays, setCopyDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    setDraft(
      original
        ? SCHOOL_DAYS.flatMap((_, index) =>
            normalizeDay(segmentsForDay(original, index + 1), index + 1),
          )
        : [],
    );
    setName(original?.name ?? 'Jadwal Bel Reguler');
    setCode(original?.code ?? '');
    setFrom(original?.effectiveFrom.slice(0, 10) ?? wibTodayISO());
    setUntil(original?.effectiveUntil?.slice(0, 10) ?? '');
    setKind(original?.kind ?? 'NORMAL');
    setReason('');
    setMessage('');
  }, [original]);
  const rows = draft
    .filter((row) => row.dayOfWeek === day)
    .sort((a, b) => a.startMinute - b.startMinute);
  const problem = useMemo(() => patternProblem(draft), [draft]);
  const jpCount = rows.filter((row) => row.type === 'INSTRUCTION').length;
  function replaceDay(values: BellSegment[]) {
    setDraft((current) => [
      ...current.filter((row) => row.dayOfWeek !== day),
      ...normalizeDay(values, day),
    ]);
  }
  function generate() {
    let cursor = minute(start);
    let jp = 0;
    const values: BellSegment[] = [];
    for (let index = 0; index < count; index++) {
      if (index === breakAfter && breakDuration > 0) {
        values.push({
          dayOfWeek: day,
          jpNumber: null,
          type: 'BREAK',
          label: 'Istirahat',
          startMinute: cursor,
          endMinute: cursor + breakDuration,
          sortOrder: values.length + 1,
        });
        cursor += breakDuration;
      }
      values.push({
        dayOfWeek: day,
        jpNumber: ++jp,
        type: 'INSTRUCTION',
        label: 'JP ' + jp,
        startMinute: cursor,
        endMinute: cursor + duration,
        sortOrder: values.length + 1,
      });
      cursor += duration;
    }
    replaceDay(values);
    setMessage('Pola dibuat sebagai draf. Tinjau hari lain sebelum menyimpan.');
  }
  async function save() {
    if (inFlight.current || problem) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const normalized = SCHOOL_DAYS.flatMap((_, index) =>
      normalizeDay(
        draft.filter((row) => row.dayOfWeek === index + 1),
        index + 1,
      ),
    );
    const body = {
      name,
      kind,
      effectiveFrom: from,
      effectiveUntil: until || null,
      provenance: reason,
      segments: normalized,
    };
    try {
      if (previewSave) {
        await previewSave({
          ...body,
          id: original?.id ?? crypto.randomUUID(),
          code: original?.code ?? code,
          revokedAt: null,
        });
        setMessage('Draf pratinjau disimpan dalam sesi lokal. Data sekolah tidak berubah.');
        setConfirm(false);
      } else {
        const result = original
          ? await updateBellSchedule(original.id, body)
          : await createBellSchedule({ ...body, code, scope: 'SCHOOL' });
        if (!result.success) setMessage(result.error ?? 'Konfigurasi gagal disimpan.');
        else {
          setMessage('Konfigurasi JP tersimpan.');
          setConfirm(false);
        }
      }
    } catch {
      setMessage('Koneksi terputus. Draf tetap tersedia; coba simpan kembali.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-sm [&_button]:min-h-11"
      aria-labelledby="jp-config-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:gap-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="shrink-0 rounded-xl bg-blue-50 p-2.5 text-blue-600 sm:p-3">
            <Settings2 size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              Langkah 1 · Sumber waktu sekolah
            </p>
            <h2 id="jp-config-title" className="mt-1 text-base font-bold text-slate-950 sm:text-lg">
              Konfigurasi Jam Pelajaran
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Atur pola setiap hari sebelum menyusun jadwal mengajar.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Pilih profil bel"
            className={field + ' max-w-60'}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
            {canManage && <option value="new">Profil baru</option>}
          </select>
        </div>
      </div>
      {loadError && (
        <p role="alert" className="m-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {loadError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 md:grid-cols-4">
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">
          Nama profil
          <input
            className={field}
            value={name}
            disabled={!canManage}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">
          {original ? 'Jenis kalender' : 'Kode profil'}
          {original ? (
            <select
              className={field}
              value={kind}
              disabled={!canManage}
              onChange={(event) => setKind(event.target.value as BellProfile['kind'])}
            >
              <option value="NORMAL">Reguler</option>
              <option value="RAMADAN">Ramadan</option>
              <option value="EXAM">Ujian</option>
              <option value="SPECIAL">Khusus</option>
            </select>
          ) : (
            <input
              className={field}
              placeholder="REGULER-2026"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          )}
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">
          Berlaku mulai
          <input
            type="date"
            className={field}
            value={from}
            disabled={!canManage}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">
          Berlaku sampai
          <input
            type="date"
            className={field}
            value={until}
            disabled={!canManage}
            onChange={(event) => setUntil(event.target.value)}
          />
        </label>
      </div>
      <div
        className="flex overflow-x-auto border-y border-slate-100 px-3 sm:px-5"
        aria-label="Pola hari mengajar"
      >
        {SCHOOL_DAYS.map((label, index) => (
          <button
            key={label}
            aria-pressed={day === index + 1}
            onClick={() => setDay(index + 1)}
            className={
              'min-w-20 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-w-24 sm:px-4 sm:text-sm ' +
              (day === index + 1
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:bg-slate-50')
            }
          >
            {label}
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {
                draft.filter((row) => row.dayOfWeek === index + 1 && row.type === 'INSTRUCTION')
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">
                {SCHOOL_DAYS[day - 1]}{' '}
                <span className="ml-2 text-sm font-normal text-slate-500">{jpCount} JP</span>
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Waktu WIB · durasi dapat berbeda tiap segmen.
              </p>
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopyDays([]);
                  setCopyOpen(true);
                }}
              >
                <Copy size={14} className="mr-2" />
                Salin pola
              </Button>
            )}
          </div>
          <div className="divide-y rounded-xl border border-slate-200 md:hidden">
            {rows.map((row, index) => (
              <article key={index} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <h4
                    className={
                      'rounded-lg px-2 py-1 text-sm font-semibold ' +
                      (row.type === 'INSTRUCTION'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-800')
                    }
                  >
                    {row.label}
                  </h4>
                  <span className="text-xs text-slate-500">
                    {row.endMinute - row.startMinute} menit
                  </span>
                  {canManage && (
                    <button
                      aria-label={'Hapus ' + row.label + ' ponsel'}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50"
                      onClick={() => replaceDay(rows.filter((_, position) => position !== index))}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs text-slate-600">
                    Mulai
                    <input
                      aria-label={'Mulai ' + row.label + ' ponsel'}
                      className={field}
                      type="time"
                      value={fmtMin(row.startMinute)}
                      disabled={!canManage}
                      onChange={(event) =>
                        replaceDay(
                          rows.map((item, position) =>
                            position === index
                              ? { ...item, startMinute: minute(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    Selesai
                    <input
                      aria-label={'Selesai ' + row.label + ' ponsel'}
                      className={field}
                      type="time"
                      value={fmtMin(row.endMinute)}
                      disabled={!canManage}
                      onChange={(event) =>
                        replaceDay(
                          rows.map((item, position) =>
                            position === index
                              ? { ...item, endMinute: minute(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
            {!rows.length && (
              <p className="p-5 text-sm text-slate-500">
                Belum ada JP. Konfigurasikan sebelum membuat jadwal.
              </p>
            )}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="p-3">Segmen</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                  <th>Durasi</th>
                  <th className="relative w-10">
                    <span className="sr-only">Hapus</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="p-3">
                      <span
                        className={
                          'inline-block min-w-20 rounded-lg px-2.5 py-1.5 font-medium ' +
                          (row.type === 'INSTRUCTION'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-800')
                        }
                      >
                        {row.label}
                      </span>
                    </td>
                    <td>
                      <input
                        aria-label={'Mulai ' + row.label}
                        type="time"
                        value={fmtMin(row.startMinute)}
                        disabled={!canManage}
                        className="min-h-11 w-24 rounded border border-slate-200 p-1.5 text-sm"
                        onChange={(event) =>
                          replaceDay(
                            rows.map((item, position) =>
                              position === index
                                ? { ...item, startMinute: minute(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={'Selesai ' + row.label}
                        type="time"
                        value={fmtMin(row.endMinute)}
                        disabled={!canManage}
                        className="min-h-11 w-24 rounded border border-slate-200 p-1.5 text-sm"
                        onChange={(event) =>
                          replaceDay(
                            rows.map((item, position) =>
                              position === index
                                ? { ...item, endMinute: minute(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="text-xs text-slate-500">
                      {row.endMinute - row.startMinute} mnt
                    </td>
                    <td>
                      {canManage && (
                        <button
                          className="flex min-h-11 min-w-11 items-center justify-center rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={'Hapus ' + row.label}
                          onClick={() =>
                            replaceDay(rows.filter((_, position) => position !== index))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Belum ada JP. Hari ini tidak tersedia untuk penjadwalan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {canManage && (
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={jpCount >= 16}
                onClick={() => {
                  const last = rows.at(-1)?.endMinute ?? minute(start);
                  replaceDay([
                    ...rows,
                    {
                      dayOfWeek: day,
                      jpNumber: jpCount + 1,
                      type: 'INSTRUCTION',
                      label: 'JP',
                      startMinute: last,
                      endMinute: last + duration,
                      sortOrder: rows.length + 1,
                    },
                  ]);
                }}
              >
                <Plus size={14} className="mr-1" />
                Tambah JP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const last = rows.at(-1)?.endMinute ?? minute(start);
                  replaceDay([
                    ...rows,
                    {
                      dayOfWeek: day,
                      jpNumber: null,
                      type: 'BREAK',
                      label: 'Istirahat',
                      startMinute: last,
                      endMinute: last + 15,
                      sortOrder: rows.length + 1,
                    },
                  ]);
                }}
              >
                <Clock3 size={14} className="mr-1" />
                Istirahat
              </Button>
            </div>
          )}
        </div>
        <aside className="border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarClock size={17} className="text-blue-600" />
            Pembuat pola cepat
          </h3>
          <p className="mb-4 mt-2 text-xs leading-relaxed text-slate-500">
            Buat kerangka, lalu sesuaikan pada tabel. Hanya mengubah hari terpilih.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs text-slate-600">
              Jumlah JP
              <input
                type="number"
                className={field}
                min={1}
                max={16}
                value={count}
                disabled={!canManage}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-slate-600">
              Durasi JP (mnt)
              <input
                type="number"
                className={field}
                min={10}
                max={120}
                value={duration}
                disabled={!canManage}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-slate-600">
              Istirahat setelah JP
              <input
                type="number"
                className={field}
                min={0}
                max={16}
                value={breakAfter}
                disabled={!canManage}
                onChange={(event) => setBreakAfter(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-slate-600">
              Durasi istirahat
              <input
                type="number"
                className={field}
                min={0}
                max={120}
                value={breakDuration}
                disabled={!canManage}
                onChange={(event) => setBreakDuration(Number(event.target.value))}
              />
            </label>
            <label className="col-span-2 grid gap-1.5 text-xs text-slate-600">
              Mulai pembelajaran
              <input
                type="time"
                className={field}
                value={start}
                disabled={!canManage}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
          </div>
          {canManage && (
            <Button
              variant="outline"
              className="mt-4 w-full border-blue-200 text-blue-700"
              onClick={generate}
              disabled={
                !count ||
                count > 16 ||
                duration < 10 ||
                duration > 120 ||
                breakAfter < 0 ||
                breakDuration < 0 ||
                breakDuration > 120
              }
            >
              Buat ulang pola {SCHOOL_DAYS[day - 1]}
            </Button>
          )}
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
            <Check size={15} className="mb-2 text-blue-600" />
            Pilihan JP menggunakan pola tersimpan, bukan draf. Tanpa pola, jadwal tidak dapat
            dibuat.
          </div>
        </aside>
      </div>
      <div className="flex flex-col gap-4 border-t border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid flex-1 gap-1.5 text-xs font-medium text-slate-600">
          Alasan / sumber konfigurasi
          <input
            className={field + ' max-w-xl'}
            value={reason}
            disabled={!canManage}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: hasil rapat kurikulum 6 Oktober 2026"
            maxLength={255}
          />
        </label>
        {canManage && (
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setConfirm(true)}
            disabled={
              busy ||
              Boolean(problem) ||
              !draft.length ||
              reason.trim().length < 3 ||
              !name.trim() ||
              !from ||
              (!original && !code)
            }
          >
            <Save size={16} className="mr-2" />
            Tinjau & simpan
          </Button>
        )}
        {canManage && original && (
          <Button
            variant="outline"
            className="min-h-11 text-rose-700"
            disabled={busy}
            onClick={() => setRevokeOpen(true)}
          >
            Cabut profil
          </Button>
        )}
      </div>
      {(problem || message) && (
        <p
          role={problem ? 'alert' : 'status'}
          className={
            'mx-5 mb-5 rounded-lg p-3 text-sm ' +
            (problem ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-800')
          }
        >
          {problem || message}
        </p>
      )}
      <Dialog
        open={confirm}
        onOpenChange={(value: boolean) => {
          if (!busy) setConfirm(value);
        }}
      >
        <DialogContent className="max-h-[94dvh] w-[calc(100%_-_2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tinjau konfigurasi JP</DialogTitle>
            <DialogDescription>
              Server memeriksa cakupan periode, waktu bertumpuk, dan dampak pada jadwal lama sebelum
              menyimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {SCHOOL_DAYS.map((label, index) => (
              <div key={label} className="rounded-lg border p-3 text-sm">
                <span className="text-slate-500">{label}</span>
                <p className="mt-1 font-bold">
                  {
                    draft.filter((row) => row.dayOfWeek === index + 1 && row.type === 'INSTRUCTION')
                      .length
                  }{' '}
                  JP
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            {from} — {until || 'tanpa batas akhir'}. Sesi yang sudah dibentuk tetap menyimpan
            snapshot waktunya.
          </p>
          {message && (
            <p role="status" className="text-sm text-rose-700">
              {message}
            </p>
          )}
          <Button onClick={save} disabled={busy}>
            {busy ? 'Memeriksa & menyimpan…' : 'Simpan konfigurasi'}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={revokeOpen}
        onOpenChange={(value: boolean) => {
          if (!busy) setRevokeOpen(value);
        }}
      >
        <DialogContent
          closeDisabled={busy}
          className="max-h-[94dvh] w-[calc(100%_-_2rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Cabut profil bel?</DialogTitle>
            <DialogDescription>
              Profil tidak dihapus. Server menolak pencabutan jika jadwal masih bergantung pada
              cakupan JP ini. Siapkan profil pengganti atau sesuaikan jadwal terlebih dahulu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setRevokeOpen(false)}>
              Batal
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              disabled={busy}
              onClick={async () => {
                if (!original || inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                try {
                  if (previewSave) {
                    setMessage(
                      'Pratinjau tidak mencabut pola karena contoh jadwal masih bergantung padanya. Siapkan pengganti dahulu.',
                    );
                  } else {
                    const result = await revokeBellSchedule(original.id);
                    setMessage(
                      result.success
                        ? 'Profil dicabut. Rekam konfigurasi tetap tersimpan.'
                        : (result.error ?? 'Profil belum dapat dicabut.'),
                    );
                  }
                  setRevokeOpen(false);
                } catch {
                  setMessage('Koneksi terputus; status pencabutan belum terkonfirmasi.');
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Memeriksa…' : 'Cabut profil'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-h-[94dvh] w-[calc(100%_-_2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Salin pola {SCHOOL_DAYS[day - 1]}</DialogTitle>
            <DialogDescription>
              Pola lama pada hari tujuan akan diganti dalam draf.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {SCHOOL_DAYS.map(
              (label, index) =>
                index + 1 !== day && (
                  <label key={label} className="flex items-center gap-3 rounded-lg border p-3">
                    <input
                      type="checkbox"
                      checked={copyDays.includes(index + 1)}
                      onChange={(event) =>
                        setCopyDays((current) =>
                          event.target.checked
                            ? [...current, index + 1]
                            : current.filter((value) => value !== index + 1),
                        )
                      }
                    />
                    {label}
                  </label>
                ),
            )}
          </div>
          <Button
            disabled={!copyDays.length}
            onClick={() => {
              setDraft((current) => [
                ...current.filter((row) => !copyDays.includes(row.dayOfWeek)),
                ...copyDays.flatMap((target) => normalizeDay(rows, target)),
              ]);
              setCopyOpen(false);
            }}
          >
            Salin ke {copyDays.length} hari
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
