export type ApplicantRole = 'guardian' | 'student';
export type Gender = 'L' | 'P';
export type MajorCode = 'AKL' | 'TKJ' | 'TKRO' | 'TBSM';

export type SpmbStepKey = 'start' | 'student' | 'major' | 'contact' | 'review';

export interface SpmbIntakeDraft {
  idempotencyKey: string;
  applicantRole: ApplicantRole | '';
  fullName: string;
  gender: Gender | '';
  nisn: string;
  schoolOrigin: string;
  interestMajor: MajorCode | '';
  guardianName: string;
  guardianRelation: string;
  phone: string;
  email: string;
  consent: boolean;
}

export interface PublicIntakeReceipt {
  id: string;
  status: string;
  registrationNo: string;
  submittedAt: string;
}

export interface PublicProof {
  registrationNo: string;
  submittedAt: string;
  fullName: string;
  gender: string;
  schoolOrigin: string;
  interestMajor: string;
  status: string;
}

export const SPMB_STEPS: { key: SpmbStepKey; label: string }[] = [
  { key: 'start', label: 'Mulai' },
  { key: 'student', label: 'Calon siswa' },
  { key: 'major', label: 'Jurusan' },
  { key: 'contact', label: 'Kontak' },
  { key: 'review', label: 'Tinjau' },
];

export const MAJOR_OPTIONS: { code: MajorCode; title: string; short: string }[] = [
  { code: 'AKL', title: 'Akuntansi dan Keuangan Lembaga', short: 'AKL' },
  { code: 'TKJ', title: 'Teknik Komputer dan Jaringan', short: 'TKJ' },
  { code: 'TKRO', title: 'Teknik Kendaraan Ringan Otomotif', short: 'TKRO' },
  { code: 'TBSM', title: 'Teknik dan Bisnis Sepeda Motor', short: 'TBSM' },
];

export const REQUIRED_DOCUMENTS = [
  'Kartu Keluarga',
  'KTP orang tua/wali',
  'Akta kelahiran',
  'Ijazah atau SKL jika sudah terbit',
  'Pas foto terbaru',
] as const;

export function createInitialSpmbDraft(idempotencyKey = ''): SpmbIntakeDraft {
  return {
    idempotencyKey,
    applicantRole: '',
    fullName: '',
    gender: '',
    nisn: '',
    schoolOrigin: '',
    interestMajor: '',
    guardianName: '',
    guardianRelation: '',
    phone: '',
    email: '',
    consent: false,
  };
}

export function normalizeIndonesianPhone(value: string): string {
  const cleaned = value.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+62')) return cleaned.slice(1);
  if (cleaned.startsWith('0')) return `62${cleaned.slice(1)}`;
  return cleaned;
}

function isValidPhone(value: string): boolean {
  return /^62\d{8,12}$/.test(normalizeIndonesianPhone(value));
}

function isValidEmail(value: string): boolean {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidNisn(value: string): boolean {
  if (!value.trim()) return true;
  return /^\d{10}$/.test(value.trim());
}

function requireText(value: string, message: string, min = 2): string | null {
  return value.trim().length >= min ? null : message;
}

export function genderLabel(gender: Gender | ''): string {
  if (gender === 'L') return 'Laki-laki';
  if (gender === 'P') return 'Perempuan';
  return '-';
}

export function majorLabel(code: MajorCode | ''): string {
  return MAJOR_OPTIONS.find((major) => major.code === code)?.title ?? '-';
}

export function publicStatusLabel(status: string): string {
  if (status === 'new') return 'Menunggu verifikasi panitia';
  if (status === 'registered') return 'Diterima untuk daftar ulang';
  if (status === 'contacted' || status === 'interested') return 'Sedang ditinjau panitia';
  if (status === 'rejected' || status === 'cold') return 'Perlu koreksi melalui panitia';
  return 'Menunggu verifikasi panitia';
}

export function validateSpmbStep(stepIndex: number, draft: SpmbIntakeDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const step = SPMB_STEPS[stepIndex]?.key;

  if (step === 'start') {
    if (!draft.applicantRole) errors.applicantRole = 'Pilih siapa yang mengisi formulir';
  }

  if (step === 'student') {
    const nameError = requireText(draft.fullName, 'Nama calon siswa wajib diisi');
    const schoolError = requireText(draft.schoolOrigin, 'Asal sekolah wajib diisi');
    if (nameError) errors.fullName = nameError;
    if (!draft.gender) errors.gender = 'Pilih jenis kelamin terlebih dahulu';
    if (!isValidNisn(draft.nisn)) errors.nisn = 'NISN harus berisi 10 digit angka';
    if (schoolError) errors.schoolOrigin = schoolError;
  }

  if (step === 'major') {
    if (!draft.interestMajor) errors.interestMajor = 'Pilih jurusan minat terlebih dahulu';
  }

  if (step === 'contact') {
    const guardianNameError = requireText(draft.guardianName, 'Nama orang tua/wali wajib diisi');
    const relationError = requireText(draft.guardianRelation, 'Hubungan dengan calon siswa wajib diisi');
    if (guardianNameError) errors.guardianName = guardianNameError;
    if (relationError) errors.guardianRelation = relationError;
    if (!isValidPhone(draft.phone)) errors.phone = 'Nomor WA belum valid';
    if (!isValidEmail(draft.email)) errors.email = 'Format email tidak valid';
  }

  if (step === 'review') {
    Object.assign(errors, validateAllSpmbFields(draft));
    if (!draft.consent) errors.consent = 'Persetujuan pemrosesan data wajib disetujui';
  }

  return errors;
}

export function validateAllSpmbFields(draft: SpmbIntakeDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (let i = 0; i < SPMB_STEPS.length - 1; i += 1) {
    Object.assign(errors, validateSpmbStep(i, draft));
  }
  return errors;
}

export function canSubmitSpmbDraft(draft: SpmbIntakeDraft): boolean {
  return Object.keys(validateSpmbStep(SPMB_STEPS.length - 1, draft)).length === 0;
}

export function buildSpmbSubmitPayload(draft: SpmbIntakeDraft) {
  const payload = {
    idempotencyKey: draft.idempotencyKey,
    applicantRole: draft.applicantRole as ApplicantRole,
    fullName: draft.fullName.trim(),
    gender: draft.gender as Gender,
    schoolOrigin: draft.schoolOrigin.trim(),
    interestMajor: draft.interestMajor as MajorCode,
    guardianName: draft.guardianName.trim(),
    guardianRelation: draft.guardianRelation.trim(),
    phone: normalizeIndonesianPhone(draft.phone),
    consent: draft.consent,
    ...(draft.nisn.trim() ? { nisn: draft.nisn.trim() } : {}),
    ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
  };

  return payload;
}

export function buildPublicProof(receipt: PublicIntakeReceipt, draft: SpmbIntakeDraft): PublicProof {
  return {
    registrationNo: receipt.registrationNo,
    submittedAt: receipt.submittedAt,
    fullName: draft.fullName.trim(),
    gender: genderLabel(draft.gender),
    schoolOrigin: draft.schoolOrigin.trim(),
    interestMajor: majorLabel(draft.interestMajor),
    status: publicStatusLabel(receipt.status),
  };
}

export function proofContainsSensitiveFields(proof: PublicProof): boolean {
  const text = Object.values(proof).join(' ');
  return /(\+?62\d{8,12}|\b\d{10}\b|@)/.test(text);
}
