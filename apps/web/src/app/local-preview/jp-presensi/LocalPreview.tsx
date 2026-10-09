'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  GraduationCap,
  Home,
  LayoutDashboard,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AttendanceEngine } from '@/components/attendance/AttendanceEngine';
import TeacherAttendanceView from '@/components/attendance/TeacherAttendanceView';
import AdminAttendanceView from '@/components/attendance/AdminAttendanceView';
import BellPatternEditor from '@/app/dashboard/jadwal/_components/BellPatternEditor';
import { BellPatternProvider } from '@/components/providers/BellPatternProvider';
import { Button } from '@/components/ui/button';
import { slotsForDay, type BellProfile } from '@/lib/bell-patterns';
import { fmtMin } from '@/lib/bell-times';
import {
  createPreviewGateway,
  previewContext,
  type PreviewArrivalKind,
  PREVIEW_PROFILE,
  PREVIEW_DATE,
  type PreviewScenario,
} from './fixtures';

export default function LocalPreview() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [view, setView] = useState('schedule');
  const [scenario, setScenario] = useState<PreviewScenario>('INSIDE');
  const [failSave, setFailSave] = useState(false);
  const [arrivalKind, setArrivalKind] = useState<PreviewArrivalKind>('TEACHER');
  const [autoPrompt, setAutoPrompt] = useState(false);
  const options = useRef({ scenario, failSave });
  options.current = { scenario, failSave };
  const gateway = useMemo(
    () => createPreviewGateway(() => options.current, arrivalKind),
    [arrivalKind],
  );
  const [profiles, setProfiles] = useState<BellProfile[]>([PREVIEW_PROFILE]);
  const [day, setDay] = useState(2);
  const [slotOpen, setSlotOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState('NORMAL');
  const [message, setMessage] = useState('');
  const capture = useMemo(
    () => async () => ({
      lat: -6.97,
      lng: 109.83,
      accuracyM: options.current.scenario === 'LOW_ACCURACY' ? 240 : 8,
      capturedAt: new Date().toISOString(),
    }),
    [],
  );
  const nav = [
    { id: 'schedule', label: 'Jadwal & JP', icon: CalendarDays },
    { id: 'teacher', label: 'Presensi Guru', icon: GraduationCap },
    { id: 'admin', label: 'Rekap Super Admin', icon: ShieldCheck },
  ];
  return (
    <div data-preview-ready={ready} className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col bg-[#10263f] px-4 py-6 text-slate-300 lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 pb-5">
          <div className="text-cyan-400">
            <GraduationCap size={38} />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight text-white">DIIS</p>
            <p className="mt-1 text-[9px] leading-relaxed">
              Digital Integrated
              <br />
              Information System
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm font-bold text-white">SMK Darussalam Subah</p>
        <p className="mt-1 text-[11px] text-slate-400">Kab. Batang, Jawa Tengah</p>
        <p className="mb-3 mt-8 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Pratinjau perbaikan
        </p>
        <nav className="space-y-2">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={
                'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ' +
                (view === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20'
                  : 'hover:bg-white/5')
              }
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-8 space-y-5 px-3 text-xs text-slate-500">
          <p className="flex items-center gap-3">
            <LayoutDashboard size={16} />
            Dashboard
          </p>
          <p className="flex items-center gap-3">
            <Users size={16} />
            Guru & Pegawai
          </p>
          <p className="flex items-center gap-3">
            <Settings2 size={16} />
            Pengaturan
          </p>
        </div>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <Home size={28} className="mb-3 text-cyan-400" />
          <p className="text-xs font-semibold text-white">Pratinjau lokal · data sintetis</p>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Interaksi memakai komponen aplikasi. Tidak tersambung ke data sekolah.
          </p>
        </div>
      </aside>
      <div className="lg:ml-[220px]">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 lg:px-7">
          <div className="flex max-w-sm flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
            <Search size={15} />
            Pratinjau desain DIIS
            <span className="ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] sm:block">
              Lokal
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="hidden items-center gap-2 sm:flex">
              <CalendarDays size={16} />
              Selasa, 6 Oktober 2026
            </span>
            <Bell size={18} />
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 font-bold text-cyan-700">
              BA
            </span>
            <div className="hidden sm:block">
              <p className="font-semibold text-slate-900">Bima Aksara</p>
              <p className="mt-0.5 text-[10px]">
                {view === 'teacher' ? 'Guru (sintetis)' : 'Super Admin (pratinjau)'}
              </p>
            </div>
          </div>
        </header>
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-[11px] leading-relaxed text-amber-900 lg:px-7">
          PRATINJAU DESAIN LOKAL — data dan penyimpanan pada layar ini adalah simulasi sesi.
          Pengujian database dilakukan terpisah. Tidak ada commit, push, atau deploy.
        </div>
        <div className="flex gap-2 overflow-x-auto border-b bg-white px-4 py-2 lg:hidden">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={
                'min-h-11 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ' +
                (view === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500')
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <main className="mx-auto max-w-[1600px] space-y-5 p-4 lg:p-7">
          {view === 'teacher' && (
            <section className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 text-xs">
              <label className="grid gap-1 text-slate-600">
                Aturan kehadiran
                <select
                  aria-label="Aturan kehadiran pratinjau"
                  className="min-h-11 max-w-full rounded border bg-white px-2 text-sm"
                  value={arrivalKind}
                  onChange={(event) => setArrivalKind(event.target.value as PreviewArrivalKind)}
                >
                  <option value="TEACHER">Guru · pelajaran pertama</option>
                  <option value="TU">TU · pukul 07.00</option>
                  <option value="PRINCIPAL">Kepala sekolah · bebas waktu</option>
                  <option value="NO_SCHEDULE">Guru · tanpa jadwal hari ini</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-slate-600">
                Skenario lokasi
                <select
                  value={scenario}
                  className="min-h-11 max-w-full rounded border bg-white px-2 text-sm"
                  onChange={(event) => setScenario(event.target.value as PreviewScenario)}
                >
                  <option value="INSIDE">Di area · terverifikasi</option>
                  <option value="OUTSIDE">Di luar area</option>
                  <option value="GPS_FAILED">GPS dibatasi kebijakan</option>
                  <option value="LOW_ACCURACY">Akurasi rendah</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={autoPrompt}
                  onChange={(event) => setAutoPrompt(event.target.checked)}
                />
                Uji sapaan otomatis
              </label>
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={failSave}
                  onChange={(event) => setFailSave(event.target.checked)}
                />
                Simulasikan gagal simpan
              </label>
              <span className="text-[10px] text-slate-500">
                Muat ulang tab untuk reset simulasi.
              </span>
            </section>
          )}
          <BellPatternProvider profiles={profiles}>
            <AttendanceEngine
              key={arrivalKind}
              initial={previewContext(arrivalKind)}
              gateway={gateway}
              autoPrompt={autoPrompt}
              locationCapture={capture}
            >
              {view === 'teacher' && <TeacherAttendanceView />}
              {view === 'admin' && <AdminAttendanceView canManage initialDate={PREVIEW_DATE} />}
              {view === 'schedule' && (
                <>
                  <header>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      Operasional Akademik
                    </p>
                    <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                      Penjadwalan Mengajar
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                      Satu konfigurasi waktu, pola fleksibel setiap hari, konflik tetap terkendali.
                    </p>
                  </header>
                  <BellPatternEditor
                    profiles={profiles}
                    canManage
                    loadError={null}
                    previewSave={async (profile) =>
                      setProfiles((current) =>
                        current.some((item) => item.id === profile.id)
                          ? current.map((item) => (item.id === profile.id ? profile : item))
                          : [...current, profile],
                      )
                    }
                  />
                  <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-blue-600">
                          Langkah 2 · Jadwal Mengajar
                        </p>
                        <h2 className="mt-1 text-base font-bold sm:text-lg">
                          Pilihan JP mengikuti pola hari
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Contoh kelas gabungan: XI TKJ 1 + XI TKJ 2 · PJOK · Lapangan
                        </p>
                      </div>
                      <Button
                        className="min-h-11 bg-blue-600 hover:bg-blue-700"
                        onClick={() => setSlotOpen((current) => !current)}
                      >
                        Coba Tambah Slot
                      </Button>
                    </div>
                    {slotOpen && (
                      <div className="mt-4 grid gap-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4 md:grid-cols-3">
                        <label className="grid gap-2 text-xs text-slate-600">
                          Hari
                          <select
                            aria-label="Hari pratinjau slot"
                            className="h-11 min-w-0 rounded-lg border bg-white px-3 text-base sm:text-sm"
                            value={day}
                            onChange={(event) => setDay(Number(event.target.value))}
                          >
                            {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map(
                              (label, index) => (
                                <option key={label} value={index + 1}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="grid gap-2 text-xs text-slate-600">
                          JP mulai
                          <select
                            aria-label="JP mulai pratinjau"
                            className="h-11 min-w-0 rounded-lg border bg-white px-3 text-base sm:text-sm"
                          >
                            {slotsForDay(profiles[0] ?? null, day).map((slot) => (
                              <option key={slot.jp} value={slot.jp}>
                                JP {slot.jp} · {fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-xs text-slate-600">
                          Pola pelaksanaan
                          <select
                            aria-label="Pola pelaksanaan pratinjau"
                            className="h-11 min-w-0 rounded-lg border bg-white px-3 text-base sm:text-sm"
                            value={previewMode}
                            onChange={(event) => setPreviewMode(event.target.value)}
                          >
                            <option value="NORMAL">Normal</option>
                            <option value="JOINT_CLASS">Kelas gabungan resmi</option>
                            <option value="AUTHORIZED_EXCEPTION">Pengecualian sementara</option>
                          </select>
                        </label>
                        <p className="text-xs leading-relaxed text-blue-800 md:col-span-3">
                          {previewMode === 'JOINT_CLASS'
                            ? 'Guru, mapel, hari, JP, dan lokasi harus sama; catatan kelas tetap terpisah.'
                            : previewMode === 'AUTHORIZED_EXCEPTION'
                              ? 'Memerlukan alasan, tanggal berakhir, dan persetujuan Super Admin/Wakasek Kurikulum aktif.'
                              : 'Konflik guru, kelas, dan ruang biasa tetap ditolak.'}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setMessage(
                              'Ini hanya pratinjau pilihan JP. Penyimpanan jadwal sebenarnya dilakukan melalui halaman berizin dan diuji di database lokal.',
                            )
                          }
                        >
                          Tinjau aturan
                        </Button>
                        {message && (
                          <p role="status" className="text-xs text-slate-600 md:col-span-2">
                            {message}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </AttendanceEngine>
          </BellPatternProvider>
        </main>
      </div>
    </div>
  );
}
