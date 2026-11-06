'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MonthCalendar from '../../_components/MonthCalendar';
import { EVENT_META, MONTH_NAMES, type KaldikEvent } from '@/lib/kiosk';
import {
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
} from '../actions';
import type { CalendarEvent } from '../page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { calendarEmptyStateMessage, canMutateCalendar } from '../kalender-ui';
import { wibTodayISO } from '@/lib/bell-times';

const TYPE_OPTIONS: { value: KaldikEvent['type']; label: string }[] = [
  { value: 'exam', label: 'Ujian' },
  { value: 'event', label: 'Acara' },
  { value: 'holiday', label: 'Libur' },
  { value: 'break', label: 'Jeda' },
];

interface Props {
  events: CalendarEvent[];
  academicYear: { id: string; code: string } | null;
  periodWarning?: string | null;
}

function toKaldik(e: CalendarEvent): KaldikEvent {
  return {
    id: e.id,
    name: e.name,
    date: e.startDate.slice(0, 10),
    endDate: e.endDate.slice(0, 10),
    type: e.type,
  };
}

export default function KalenderClient({ events, academicYear, periodWarning }: Props) {
  const router = useRouter();
  const todayISO = wibTodayISO();
  // A date-only calendar must not shift to yesterday in the browser's timezone.
  const today = new Date(`${todayISO}T12:00:00`);
  const opener = useRef<HTMLElement | null>(null);
  const [cal, setCal] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // form dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<KaldikEvent['type']>('event');
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState(todayISO);
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('08:00'),
    [endTime, setEndTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const kaldik = useMemo(() => events.map(toKaldik), [events]);
  const sorted = useMemo(
    () => [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [events],
  );
  const canMutate = canMutateCalendar(academicYear, periodWarning);

  const openNew = () => {
    if (!canMutate) return;
    opener.current = document.activeElement as HTMLElement;
    setEditId(null);
    setName('');
    setType('event');
    setStartDate(todayISO);
    setEndDate(todayISO);
    setDescription('');
    setErr('');
    setOpen(true);
    setAllDay(true);
    setStartTime('08:00');
    setEndTime('09:00');
    setLocation('');
  };
  const openEdit = (e: CalendarEvent) => {
    if (!canMutate) return;
    opener.current = document.activeElement as HTMLElement;
    setEditId(e.id);
    setName(e.name);
    setType(e.type);
    setStartDate(e.startDate.slice(0, 10));
    setEndDate(e.endDate.slice(0, 10));
    setDescription(e.description ?? '');
    setErr('');
    setOpen(true);
    const clock = (value: string) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(value));
    setAllDay(!e.startAt);
    setStartTime(e.startAt ? clock(e.startAt) : '08:00');
    setEndTime(e.endAt ? clock(e.endAt) : '09:00');
    setLocation(e.location ?? '');
  };

  const submit = async () => {
    setErr('');
    if (!academicYear || !canMutate) {
      setErr('Agenda hanya dapat diubah saat tahun ajaran aktif berhasil dimuat.');
      return;
    }
    if (name.trim().length < 2) {
      setErr('Nama agenda minimal 2 karakter.');
      return;
    }
    if (!startDate || !endDate) {
      setErr('Tanggal mulai dan selesai wajib diisi.');
      return;
    }
    if (endDate < startDate) {
      setErr('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }
    if (busy) return;
    const startAt = allDay ? null : `${startDate}T${startTime}:00+07:00`,
      endAt = allDay ? null : `${endDate}T${endTime}:00+07:00`;
    if (!allDay && (!startTime || !endTime || Date.parse(endAt!) <= Date.parse(startAt!))) {
      setErr('Jam selesai harus setelah jam mulai (WIB).');
      return;
    }
    setBusy(true);
    try {
      const body = {
        academicYearId: academicYear.id,
        name: name.trim(),
        startDate,
        endDate,
        type,
        description: description.trim() || null,
        startAt,
        endAt,
        location: location.trim() || null,
      };
      const res = editId
        ? await updateCalendarEventAction(editId, body)
        : await createCalendarEventAction(body);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      setMsg(editId ? 'Agenda diperbarui.' : 'Agenda ditambahkan.');
      router.refresh();
    } catch {
      setErr('Agenda belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: CalendarEvent) => {
    setMsg('');
    setErr('');
    setDeleteError('');
    if (!canMutate) {
      setDeleteError('Agenda hanya dapat dihapus saat tahun ajaran aktif berhasil dimuat.');
      return false;
    }
    const res = await deleteCalendarEventAction(e.id);
    if (res.error) {
      setDeleteError(res.error);
      return false;
    }
    setMsg('Agenda dihapus.');
    setDeleteTarget(null);
    router.refresh();
    return true;
  };

  const fmtRange = (e: CalendarEvent) => {
    const s = new Date(`${e.startDate.slice(0, 10)}T12:00:00`);
    const en = new Date(`${e.endDate.slice(0, 10)}T12:00:00`);
    const m3 = (d: Date) => (MONTH_NAMES[d.getMonth()] ?? '').slice(0, 3);
    if (e.startDate.slice(0, 10) === e.endDate.slice(0, 10))
      return `${s.getDate()} ${m3(s)} ${s.getFullYear()}`;
    return `${s.getDate()} ${m3(s)} – ${en.getDate()} ${m3(en)} ${en.getFullYear()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950 dark:text-slate-100">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <CalendarDays className="h-5 w-5" />
            </span>
            Kalender & Agenda Sekolah
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola agenda, ujian, dan hari libur (kaldik). Tampil otomatis di Beranda. Hari libur
            tidak dihitung sebagai hari aktif.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            T.A. {academicYear?.code ?? 'Mode baca saja'}
          </span>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={!canMutate}
            onClick={openNew}
          >
            <CalendarPlus className="h-4 w-4" /> Tambah Agenda
          </Button>
        </div>
      </div>

      {periodWarning && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {periodWarning}
        </div>
      )}

      {msg && (
        <div
          role="status"
          className={clsx(
            'rounded-lg px-4 py-2 text-sm',
            msg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <MonthCalendar
            year={cal.y}
            month0={cal.m}
            onNav={(d) =>
              setCal((c) => {
                const x = new Date(c.y, c.m + d, 1);
                return { y: x.getFullYear(), m: x.getMonth() };
              })
            }
            onJump={(y, m0) => setCal({ y, m: m0 })}
            events={kaldik}
            todayStr={todayISO}
            accent="#059669"
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-gray-500">
            {(['exam', 'event', 'holiday', 'break'] as const).map((t) => (
              <span key={t} className="flex items-center gap-1">
                <i
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: EVENT_META[t].dot }}
                />
                {EVENT_META[t].label}
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
              Daftar Agenda — T.A. {academicYear?.code ?? 'Mode baca saja'}
            </h2>
          </div>
          {sorted.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-600 dark:text-slate-300">
              {calendarEmptyStateMessage(canMutate)}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {sorted.map((e) => {
                const meta = EVENT_META[e.type];
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className="shrink-0 w-1.5 h-9 rounded-full"
                      style={{ background: meta.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                        {e.name}
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: meta.soft, color: meta.text }}
                        >
                          {meta.label}
                        </span>
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {fmtRange(e)}
                        {e.description ? ` · ${e.description}` : ''}
                      </p>
                      {(e.startAt || e.location) && (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {e.startAt
                            ? `${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(e.startAt))}–${e.endAt ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(e.endAt)) : ''} WIB`
                            : 'Sepanjang hari'}
                          {e.location ? ` · ${e.location}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      disabled={!canMutate}
                      className="grid h-11 w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Edit agenda ${e.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canMutate) return;
                        setDeleteTarget(e);
                        setDeleteError('');
                      }}
                      disabled={!canMutate}
                      className="grid h-11 w-11 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Hapus agenda ${e.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] max-w-lg overflow-y-auto"
          closeDisabled={busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Agenda' : 'Tambah Agenda'}</DialogTitle>
            <DialogDescription>
              Agenda disimpan pada tahun ajaran aktif dan tampil di kalender sekolah.
            </DialogDescription>
          </DialogHeader>
          {err && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <X className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </div>
          )}
          <fieldset disabled={busy} className="space-y-4">
            <div>
              <Label htmlFor="agenda-name">Nama Agenda *</Label>
              <Input
                id="agenda-name"
                maxLength={255}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="cth: Penilaian Akhir Semester (PAS)"
              />
            </div>
            <div>
              <Label htmlFor="agenda-type">Jenis *</Label>
              <Select
                value={type}
                onValueChange={(v: string) => {
                  setType(v as KaldikEvent['type']);
                  if (v === 'holiday' || v === 'break') setAllDay(true);
                }}
              >
                <SelectTrigger id="agenda-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="agenda-from">Tanggal Mulai *</Label>
                <Input
                  id="agenda-from"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="agenda-to">Tanggal Selesai *</Label>
                <Input
                  id="agenda-to"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                disabled={type === 'holiday' || type === 'break'}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-5 w-5 accent-emerald-700"
              />
              Sepanjang hari
            </label>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="agenda-time-from">Jam mulai (WIB)</Label>
                  <Input
                    id="agenda-time-from"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="agenda-time-to">Jam selesai (WIB)</Label>
                  <Input
                    id="agenda-time-to"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="agenda-location">Lokasi</Label>
              <Input
                id="agenda-location"
                maxLength={255}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Opsional, mis. Aula sekolah"
              />
            </div>
            <div>
              <Label htmlFor="agenda-description">Keterangan</Label>
              <Textarea
                id="agenda-description"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opsional"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                disabled={busy}
                onClick={submit}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Simpan
                  </>
                )}
              </Button>
            </div>
          </fieldset>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
            setDeleteError('');
          }
        }}
        title="Hapus agenda kalender?"
        description={
          deleteTarget
            ? `${deleteTarget.name} pada ${fmtRange(deleteTarget)} akan dihapus dari kalender sekolah.`
            : ''
        }
        confirmLabel="Hapus agenda"
        variant="danger"
        error={deleteError}
        onConfirm={async () => {
          if (!deleteTarget) return false;
          return remove(deleteTarget);
        }}
      />
    </div>
  );
}
