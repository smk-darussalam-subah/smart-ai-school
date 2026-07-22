'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildPublicProof,
  buildSpmbSubmitPayload,
  canSubmitSpmbDraft,
  createInitialSpmbDraft,
  genderLabel,
  MAJOR_OPTIONS,
  majorLabel,
  type PublicIntakeReceipt,
  type PublicProof,
  REQUIRED_DOCUMENTS,
  SPMB_STEPS,
  type SpmbIntakeDraft,
  validateSpmbStep,
} from '../spmb-intake';

type Errors = Record<string, string>;

const inputClass =
  'min-h-11 w-full rounded-lg border border-[#d9e5dd] bg-white px-3.5 py-2.5 text-[14px] text-[#0c1f17] outline-none transition focus:border-[#0b6b4f] focus:ring-2 focus:ring-[#0b6b4f]/20';

const labelClass = 'mb-1.5 block text-[13px] font-semibold text-[#1f3e34]';
const IDEMPOTENCY_STORAGE_KEY = 'diis:spmb-2027-intake:idempotency-key';

function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return fallbackUuid();
}

function getOrCreateIntakeIdempotencyKey(): string {
  if (typeof window === 'undefined') return createIdempotencyKey();
  try {
    const stored = window.sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
    if (stored) return stored;
    const next = createIdempotencyKey();
    window.sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, next);
    return next;
  } catch {
    return createIdempotencyKey();
  }
}

function clearStoredIntakeIdempotencyKey() {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable in hardened/private browser modes.
  }
}

async function readApiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const message = body?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) {
      return message
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'message' in item) return String(item.message);
          return '';
        })
        .filter(Boolean)
        .join('; ');
    }
  } catch {
    // Keep fallback below.
  }
  return 'Pendaftaran belum bisa dikirim. Coba lagi beberapa saat lagi.';
}

function formatWib(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </div>
  );
}

function ChoiceButton({
  selected,
  title,
  desc,
  icon: Icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc: string;
  icon: typeof UserRound;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-[104px] rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35 motion-reduce:transition-none ${
        selected
          ? 'border-[#0b6b4f] bg-[#e7f3ec] shadow-sm'
          : 'border-[#dfe8e2] bg-white hover:border-[#9fc3b4] hover:bg-[#fbfdf9]'
      }`}
    >
      <span className="mb-3 flex items-center justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${selected ? 'bg-[#0b6b4f] text-white' : 'bg-[#f0f5f2] text-[#0b6b4f]'}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {selected && <CheckCircle2 className="h-5 w-5 text-[#0b6b4f]" />}
      </span>
      <span className="block text-[14px] font-bold text-[#0c1f17]">{title}</span>
      <span className="mt-1 block text-[12.5px] leading-relaxed text-[#526a60]">{desc}</span>
    </button>
  );
}

function Stepper({
  step,
  unlockedStep,
  onJump,
}: {
  step: number;
  unlockedStep: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="border-b border-[#e3ede7] bg-white/80 px-4 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b6b4f]">
            Langkah {step + 1} dari {SPMB_STEPS.length}
          </p>
          <h2 className="mt-0.5 text-[18px] font-bold text-[#0c1f17] sm:text-[20px]">
            {SPMB_STEPS[step]?.label}
          </h2>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
          {SPMB_STEPS.map((item, index) => (
            <span
              key={item.key}
              className={`h-2.5 rounded-full transition-all motion-reduce:transition-none ${
                index === step ? 'w-8 bg-[#0b6b4f]' : index <= unlockedStep ? 'w-2.5 bg-[#9fc3b4]' : 'w-2.5 bg-[#d9e5dd]'
              }`}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5 sm:hidden">
        {SPMB_STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            disabled={index > unlockedStep}
            onClick={() => onJump(index)}
            aria-label={`Buka langkah ${item.label}`}
            className={`h-2 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35 motion-reduce:transition-none ${
              index === step ? 'bg-[#0b6b4f]' : index <= unlockedStep ? 'bg-[#9fc3b4]' : 'bg-[#d9e5dd]'
            } disabled:cursor-not-allowed`}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarProgress({ draft }: { draft: SpmbIntakeDraft }) {
  const selectedMajor = majorLabel(draft.interestMajor);

  return (
    <aside className="space-y-4 lg:sticky lg:top-5">
      <div className="overflow-hidden rounded-lg border border-[#dfe8e2] bg-white">
        <div className="relative h-40">
          <Image
            src="/landing/school-front.jpg"
            alt="Tampak depan SMK Darussalam Subah"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 360px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#052b22]/75 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c5f04a]">SPMB 2027/2028</p>
            <p className="mt-1 text-[17px] font-bold leading-tight">Daftar awal online DIIS</p>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#0b6b4f]" />
            <div>
              <p className="text-[13px] font-bold text-[#0c1f17]">Privasi ringkas</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#526a60]">
                Bukti publik hanya menampilkan nomor pendaftaran, waktu, nama, gender, asal sekolah, jurusan, dan status.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#dfe8e2] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock3 className="h-[18px] w-[18px] text-[#0b6b4f]" />
          <h3 className="text-[14px] font-bold text-[#0c1f17]">Alur setelah submit</h3>
        </div>
        <ol className="space-y-3 text-[12.5px] text-[#526a60]">
          {['Menunggu verifikasi panitia', 'Perlu koreksi bila ada data keliru', 'Diterima untuk daftar ulang', 'Lengkapi profil dan unggah dokumen'].map((item, index) => (
            <li key={item} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e7f3ec] text-[11px] font-bold text-[#0b6b4f]">
                {index + 1}
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border border-[#dfe8e2] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileCheck2 className="h-[18px] w-[18px] text-[#0b6b4f]" />
          <h3 className="text-[14px] font-bold text-[#0c1f17]">Berkas daftar ulang</h3>
        </div>
        <div className="space-y-2">
          {REQUIRED_DOCUMENTS.map((doc) => (
            <div key={doc} className="flex items-center gap-2 text-[12.5px] text-[#526a60]">
              <span className="grid h-5 w-5 place-items-center rounded-full border border-[#cfe1d6] text-[#0b6b4f]">
                <Check className="h-3 w-3" />
              </span>
              {doc}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[#6b8079]">
          Upload dokumen belum dibuka di daftar awal. Panitia akan membuka tahap ini setelah verifikasi.
        </p>
        {draft.interestMajor && (
          <div className="mt-3 rounded-lg border border-[#cfe1d6] bg-[#f5fbf7] px-3 py-2 text-[12px] text-[#1f3e34]">
            Jurusan minat saat ini: <b>{selectedMajor}</b>
          </div>
        )}
      </div>
    </aside>
  );
}

function StepContent({
  step,
  draft,
  errors,
  setField,
}: {
  step: number;
  draft: SpmbIntakeDraft;
  errors: Errors;
  setField: <K extends keyof SpmbIntakeDraft>(key: K, value: SpmbIntakeDraft[K]) => void;
}) {
  const current = SPMB_STEPS[step]?.key;

  if (current === 'start') {
    return (
      <section className="space-y-5">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#0b6b4f]">Daftar awal</p>
          <h1 className="mt-1 font-fraunces text-[30px] font-semibold leading-tight text-[#0c1f17] sm:text-[38px]">
            SPMB SMK Darussalam Subah 2027/2028
          </h1>
          <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-[#526a60]">
            Isi data utama calon siswa. Dokumen dan daftar ulang akan dilakukan setelah panitia memverifikasi daftar awal ini.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceButton
            selected={draft.applicantRole === 'guardian'}
            title="Orang tua/wali"
            desc="Saya mengisi data untuk calon siswa."
            icon={UsersRound}
            onClick={() => setField('applicantRole', 'guardian')}
          />
          <ChoiceButton
            selected={draft.applicantRole === 'student'}
            title="Calon siswa"
            desc="Saya mengisi data saya sendiri dengan sepengetahuan orang tua/wali."
            icon={UserRound}
            onClick={() => setField('applicantRole', 'student')}
          />
        </div>
        {errors.applicantRole && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" /> {errors.applicantRole}
          </p>
        )}
      </section>
    );
  }

  if (current === 'student') {
    return (
      <section className="grid gap-5">
        <div>
          <h2 className="text-[22px] font-bold text-[#0c1f17]">Data calon siswa</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[#526a60]">
            Gunakan nama dan asal sekolah sesuai dokumen administrasi.
          </p>
        </div>
        <Field id="fullName" label="Nama lengkap calon siswa" required error={errors.fullName}>
          <input
            id="fullName"
            value={draft.fullName}
            onChange={(e) => setField('fullName', e.target.value)}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'fullName-error' : undefined}
            className={inputClass}
            autoComplete="name"
          />
        </Field>
        <div>
          <span className={labelClass}>
            Jenis kelamin <span className="text-rose-600">*</span>
          </span>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { value: 'L', label: 'Laki-laki' },
              { value: 'P', label: 'Perempuan' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={draft.gender === item.value}
                onClick={() => setField('gender', item.value as SpmbIntakeDraft['gender'])}
                className={`min-h-11 rounded-lg border px-4 text-left text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35 ${
                  draft.gender === item.value ? 'border-[#0b6b4f] bg-[#e7f3ec] text-[#0c1f17]' : 'border-[#d9e5dd] bg-white text-[#526a60]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {errors.gender && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.gender}
            </p>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="nisn" label="NISN" error={errors.nisn}>
            <input
              id="nisn"
              value={draft.nisn}
              onChange={(e) => setField('nisn', e.target.value)}
              aria-invalid={Boolean(errors.nisn)}
              aria-describedby={errors.nisn ? 'nisn-error' : undefined}
              className={inputClass}
              inputMode="numeric"
              placeholder="Opsional"
            />
          </Field>
          <Field id="schoolOrigin" label="Asal sekolah" required error={errors.schoolOrigin}>
            <input
              id="schoolOrigin"
              value={draft.schoolOrigin}
              onChange={(e) => setField('schoolOrigin', e.target.value)}
              aria-invalid={Boolean(errors.schoolOrigin)}
              aria-describedby={errors.schoolOrigin ? 'schoolOrigin-error' : undefined}
              className={inputClass}
              autoComplete="organization"
            />
          </Field>
        </div>
      </section>
    );
  }

  if (current === 'major') {
    return (
      <section className="space-y-5">
        <div>
          <h2 className="text-[22px] font-bold text-[#0c1f17]">Pilih jurusan minat</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[#526a60]">
            Pilihan akhir akan dikonfirmasi kembali saat daftar ulang.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MAJOR_OPTIONS.map((major) => (
            <button
              key={major.code}
              type="button"
              aria-pressed={draft.interestMajor === major.code}
              onClick={() => setField('interestMajor', major.code)}
              className={`min-h-[104px] rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35 motion-reduce:transition-none ${
                draft.interestMajor === major.code
                  ? 'border-[#0b6b4f] bg-[#e7f3ec]'
                  : 'border-[#dfe8e2] bg-white hover:border-[#9fc3b4]'
              }`}
            >
              <span className="mb-3 inline-flex h-8 min-w-12 items-center justify-center rounded-md bg-[#0b6b4f] px-2.5 text-[12px] font-bold text-white">
                {major.short}
              </span>
              <span className="block text-[14px] font-bold text-[#0c1f17]">{major.title}</span>
            </button>
          ))}
        </div>
        {errors.interestMajor && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" /> {errors.interestMajor}
          </p>
        )}
      </section>
    );
  }

  if (current === 'contact') {
    return (
      <section className="grid gap-5">
        <div>
          <h2 className="text-[22px] font-bold text-[#0c1f17]">Kontak utama</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-[#526a60]">
            WhatsApp menjadi kanal utama panitia. Email hanya untuk salinan bila diisi.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="guardianName" label="Nama orang tua/wali" required error={errors.guardianName}>
            <input
              id="guardianName"
              value={draft.guardianName}
              onChange={(e) => setField('guardianName', e.target.value)}
              aria-invalid={Boolean(errors.guardianName)}
              aria-describedby={errors.guardianName ? 'guardianName-error' : undefined}
              className={inputClass}
              autoComplete="name"
            />
          </Field>
          <Field id="guardianRelation" label="Hubungan" required error={errors.guardianRelation}>
            <input
              id="guardianRelation"
              value={draft.guardianRelation}
              onChange={(e) => setField('guardianRelation', e.target.value)}
              aria-invalid={Boolean(errors.guardianRelation)}
              aria-describedby={errors.guardianRelation ? 'guardianRelation-error' : undefined}
              className={inputClass}
              placeholder="Ibu, Ayah, Wali"
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="phone" label="Nomor WhatsApp aktif" required error={errors.phone}>
            <input
              id="phone"
              value={draft.phone}
              onChange={(e) => setField('phone', e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              className={inputClass}
              inputMode="tel"
              autoComplete="tel"
              placeholder="08123456789"
            />
          </Field>
          <Field id="email" label="Email salinan bukti" error={errors.email}>
            <input
              id="email"
              value={draft.email}
              onChange={(e) => setField('email', e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={inputClass}
              inputMode="email"
              autoComplete="email"
              placeholder="Opsional"
            />
          </Field>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[22px] font-bold text-[#0c1f17]">Tinjau dan kirim</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[#526a60]">
          Pastikan data ringkas berikut benar sebelum dikirim ke panitia.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Pengisi', draft.applicantRole === 'guardian' ? 'Orang tua/wali' : draft.applicantRole === 'student' ? 'Calon siswa' : '-'],
          ['Nama calon siswa', draft.fullName || '-'],
          ['Jenis kelamin', genderLabel(draft.gender)],
          ['Asal sekolah', draft.schoolOrigin || '-'],
          ['Jurusan minat', majorLabel(draft.interestMajor)],
          ['Orang tua/wali', draft.guardianName || '-'],
          ['Hubungan', draft.guardianRelation || '-'],
          ['Nomor WA', draft.phone || '-'],
          ['Email', draft.email || 'Tidak diisi'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#dfe8e2] bg-[#fbfdf9] p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b8079]">{label}</p>
            <p className="mt-1 break-words text-[14px] font-semibold text-[#0c1f17]">{value}</p>
          </div>
        ))}
      </div>
      <label className="flex gap-3 rounded-lg border border-[#dfe8e2] bg-white p-4">
        <input
          type="checkbox"
          checked={draft.consent}
          onChange={(e) => setField('consent', e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[#9fc3b4] text-[#0b6b4f] focus:ring-[#0b6b4f]"
        />
        <span>
          <span className="block text-[13px] font-bold text-[#0c1f17]">Saya menyetujui pemrosesan data pendaftaran.</span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-[#526a60]">
            Saya adalah orang tua/wali, atau calon siswa yang mengisi dengan sepengetahuan orang tua/wali. Data digunakan untuk verifikasi daftar awal, komunikasi panitia, dan persiapan daftar ulang.
          </span>
          {errors.consent && (
            <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.consent}
            </span>
          )}
        </span>
      </label>
      <Link href="/privacy" className="inline-flex text-[12.5px] font-semibold text-[#0b6b4f] underline-offset-4 hover:underline">
        Baca kebijakan privasi sekolah
      </Link>
    </section>
  );
}

function ProofAction({
  icon: Icon,
  label,
  status,
  primary,
}: {
  icon: typeof Download;
  label: string;
  status: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left opacity-80 ${
        primary ? 'border-[#0b6b4f] bg-[#e7f3ec] text-[#0c1f17]' : 'border-[#dfe8e2] bg-white text-[#526a60]'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate text-[13px] font-bold">{label}</span>
      </span>
      <span className="shrink-0 text-[11px] font-semibold">{status}</span>
    </button>
  );
}

function SuccessPanel({ proof, draft }: { proof: PublicProof; draft: SpmbIntakeDraft }) {
  return (
    <section className="space-y-5" aria-live="polite">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
          <div>
            <h1 className="text-[22px] font-bold text-[#0c1f17]">Daftar awal berhasil dikirim</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#355a4e]">
              Simpan nomor pendaftaran ini. Panitia akan menghubungi nomor WA utama untuk verifikasi.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#dfe8e2] bg-white">
        <div className="border-b border-[#e3ede7] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0b6b4f]">Bukti pendaftaran awal</p>
          <p className="mt-1 text-[20px] font-bold text-[#0c1f17]">{proof.registrationNo}</p>
        </div>
        <dl className="grid gap-0 sm:grid-cols-2">
          {[
            ['Waktu dikirim', formatWib(proof.submittedAt)],
            ['Nama calon siswa', proof.fullName],
            ['Jenis kelamin', proof.gender],
            ['Asal sekolah', proof.schoolOrigin],
            ['Jurusan minat', proof.interestMajor],
            ['Status', proof.status],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-[#eef4f0] px-4 py-3 sm:border-r even:sm:border-r-0">
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6b8079]">{label}</dt>
              <dd className="mt-1 break-words text-[14px] font-semibold text-[#0c1f17]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-[#526a60]">
          Bukti ini bukan tanda siswa sudah diterima sebagai peserta didik.
        </p>
      </div>

      <div className="grid gap-3">
        <ProofAction icon={MessageCircle} label="Kirim ke WhatsApp" status="Menunggu konfigurasi" primary />
        <ProofAction icon={Download} label="Unduh bukti PDF" status="Menunggu konfigurasi" />
        <ProofAction
          icon={Mail}
          label={draft.email.trim() ? 'Kirim ke email' : 'Email tidak diisi'}
          status={draft.email.trim() ? 'Menunggu konfigurasi' : 'Tidak aktif'}
        />
      </div>

      <div className="rounded-lg border border-[#dfe8e2] bg-[#fbfdf9] p-4">
        <p className="text-[13px] font-bold text-[#0c1f17]">Langkah berikutnya</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#526a60]">
          Tunggu verifikasi panitia. Jika ada data yang perlu dikoreksi, panitia akan membuka revisi terarah; jangan mengirim formulir baru untuk data yang sama.
        </p>
      </div>
    </section>
  );
}

export function SpmbIntakeWizard() {
  const [draft, setDraft] = useState<SpmbIntakeDraft>(() => createInitialSpmbDraft(getOrCreateIntakeIdempotencyKey()));
  const [step, setStep] = useState(0);
  const [unlockedStep, setUnlockedStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [proof, setProof] = useState<PublicProof | null>(null);

  const canSubmit = useMemo(() => canSubmitSpmbDraft(draft), [draft]);

  function setField<K extends keyof SpmbIntakeDraft>(key: K, value: SpmbIntakeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSubmitError('');
  }

  function goNext() {
    const nextErrors = validateSpmbStep(step, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setStep((current) => {
      const next = Math.min(current + 1, SPMB_STEPS.length - 1);
      setUnlockedStep((unlocked) => Math.max(unlocked, next));
      return next;
    });
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0));
    setSubmitError('');
  }

  async function submit() {
    const nextErrors = validateSpmbStep(SPMB_STEPS.length - 1, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/backend/ppdb/spmb-2027/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSpmbSubmitPayload(draft)),
      });

      if (!res.ok) {
        setSubmitError(await readApiError(res));
        return;
      }

      const receipt = (await res.json()) as PublicIntakeReceipt;
      clearStoredIntakeIdempotencyKey();
      setProof(buildPublicProof(receipt, draft));
    } catch {
      setSubmitError('Koneksi ke server belum tersedia. Coba lagi beberapa saat lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#0c1f17]">
      <header className="border-b border-[#e3ede7] bg-[#fbfaf5]/95">
        <nav className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[#dfe8e2] bg-white">
              <Image src="/landing/logo-smk.png" alt="Logo SMK Darussalam Subah" fill className="object-contain" sizes="36px" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-[#0c1f17]">SMK Darussalam Subah</span>
              <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6b8079]">SPMB 2027/2028</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#dfe8e2] bg-white px-3 text-[13px] font-bold text-[#1f3e34] transition hover:border-[#9fc3b4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35"
          >
            <ArrowLeft className="h-4 w-4" /> Beranda
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid max-w-[1180px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-7">
        <section className="overflow-hidden rounded-lg border border-[#dfe8e2] bg-white shadow-[0_12px_34px_-28px_rgba(6,69,52,0.55)]">
          {!proof && (
            <Stepper
              step={step}
              unlockedStep={unlockedStep}
              onJump={(index) => {
                if (index <= unlockedStep) setStep(index);
              }}
            />
          )}
          <div className="p-4 sm:p-6">
            {proof ? (
              <SuccessPanel proof={proof} draft={draft} />
            ) : (
              <StepContent step={step} draft={draft} errors={errors} setField={setField} />
            )}

            {!proof && (
              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#e3ede7] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0 || submitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#dfe8e2] bg-white px-4 text-[14px] font-bold text-[#1f3e34] transition hover:border-[#9fc3b4] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Kembali
                </button>
                <div className="flex flex-col gap-2 sm:items-end">
                  {submitError && (
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
                      <AlertCircle className="h-3.5 w-3.5" /> {submitError}
                    </p>
                  )}
                  {step < SPMB_STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={submitting}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#064534] px-5 text-[14px] font-bold text-white transition hover:bg-[#0b6b4f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35"
                    >
                      Lanjut <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting || !canSubmit}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#064534] px-5 text-[14px] font-bold text-white transition hover:bg-[#0b6b4f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6b4f]/35 disabled:cursor-not-allowed disabled:bg-[#9fb5aa]"
                    >
                      {submitting ? <Clock3 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Kirim daftar awal
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <SidebarProgress draft={draft} />
      </main>
    </div>
  );
}
