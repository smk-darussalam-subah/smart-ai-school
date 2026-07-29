export type AppointmentStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ENDED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export type AppointmentKind = 'DEFINITIVE' | 'PLT';
export type AppointmentAction =
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'SUSPEND'
  | 'RESUME'
  | 'END'
  | 'SUPERSEDE'
  | 'CREATE_SUCCESSOR'
  | 'CREATE_PLT'
  | 'VIEW_HISTORY';

export type StrukturTab = 'struktur' | 'appointment' | 'persetujuan' | 'riwayat';

export interface Position {
  id: string;
  code: string;
  name: string;
  category: 'STRUKTURAL' | 'FUNGSIONAL' | 'TENDIK';
  scopeType: 'NONE' | 'MAJOR';
  maxActiveHolders: number;
  parentId: string | null;
  _count: { permissions: number };
}

export interface PositionCapability {
  positionId: string;
  code: string;
  name: string;
  canPrepare: boolean;
}

export interface Major {
  id: string;
  code: string;
  name: string;
}

export interface AcademicYear {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface AppointmentOccupancy {
  activeCount: number;
  preparedCount: number;
  capacity: number;
}

export interface AppointmentListItem {
  id: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  reason: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  suspensionUntil: string | null;
  suspensionReason: string | null;
  endedAt: string | null;
  replacesAppointmentId: string | null;
  requestedByUserId: string | null;
  createdAt: string;
  staff: {
    id: string;
    niy: string | null;
    employmentStatus: string;
    user: { id: string; fullName: string; role: string };
  };
  position: {
    id: string;
    code: string;
    name: string;
    category: string;
    scopeType: 'NONE' | 'MAJOR';
    maxActiveHolders: number;
  };
  academicYear: AcademicYear;
  major: Major | null;
  occupancy: AppointmentOccupancy;
  isEffectiveNow: boolean;
  allowedActions: AppointmentAction[];
}

export interface AppointmentRegistryResponse {
  data: AppointmentListItem[];
  total: number;
  page: number;
  limit: number;
  summary: {
    all: number;
    draft: number;
    pendingApproval: number;
    approved: number;
    active: number;
    suspended: number;
    terminal: number;
  };
}

export interface AppointmentDetail extends AppointmentListItem {
  requestedBy: { id: string; fullName: string | null } | null;
  approvals: Array<{
    decision: 'APPROVED' | 'REJECTED';
    note: string | null;
    createdAt: string;
    actorName: string | null;
  }>;
  permissions: Array<{ code: string; description: string; module: string }>;
}

export interface AppointmentHistory {
  appointmentId: string;
  appointment: {
    id: string;
    status: AppointmentStatus;
    staffName: string;
    position: { code: string; name: string };
    academicYear: { code: string };
    effectiveFrom: string;
    effectiveUntil: string | null;
  };
  timeline: Array<{
    action: string;
    label: string;
    occurredAt: string;
    actorName: string | null;
    outcome: 'success' | 'failure';
    note: string | null;
  }>;
}

export interface AppointmentCandidate {
  staffId: string;
  userId: string;
  fullName: string;
  niy: string | null;
  stableRole: 'GURU' | 'TATA_USAHA';
  employmentStatus: string;
  eligible: boolean;
}

export interface AppointmentCandidateResponse {
  data: AppointmentCandidate[];
  total: number;
  page: number;
  limit: number;
}

export interface AppointmentPermissionPreview {
  position: {
    id: string;
    code: string;
    name: string;
    category: string;
    scopeType: 'NONE' | 'MAJOR';
    maxActiveHolders: number;
  };
  permissions: Array<{ code: string; description: string; module: string }>;
  occupancy: AppointmentOccupancy | null;
  effectiveOnlyWhenActive: boolean;
}

export interface AppointmentMutationResult {
  id: string;
  status: AppointmentStatus;
}

export interface AppointmentCreatePayload {
  staffId: string;
  positionId: string;
  academicYearId: string;
  majorId?: string;
  kind: AppointmentKind;
  effectiveFrom: string;
  effectiveUntil?: string;
  reason?: string;
  replacesAppointmentId?: string;
}

export interface AppointmentDraftForm {
  academicYearId: string;
  positionId: string;
  majorId: string;
  staffId: string;
  kind: AppointmentKind;
  effectiveFrom: string;
  effectiveUntil: string;
  reason: string;
  replacesAppointmentId: string;
}

export const STRUCTURE_TABS: Array<{ id: StrukturTab; label: string }> = [
  { id: 'struktur', label: 'Struktur' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'persetujuan', label: 'Persetujuan' },
  { id: 'riwayat', label: 'Riwayat' },
];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Menunggu persetujuan',
  APPROVED: 'Disetujui - belum berlaku',
  ACTIVE: 'Aktif',
  SUSPENDED: 'Ditangguhkan',
  ENDED: 'Berakhir',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  SUPERSEDED: 'Digantikan',
};

export const ACTION_LABELS: Record<AppointmentAction, string> = {
  SUBMIT: 'Ajukan',
  APPROVE: 'Setujui',
  REJECT: 'Tolak',
  CANCEL: 'Batalkan',
  SUSPEND: 'Tangguhkan',
  RESUME: 'Lanjutkan',
  END: 'Akhiri',
  SUPERSEDE: 'Aktifkan pengganti',
  CREATE_SUCCESSOR: 'Siapkan pengganti',
  CREATE_PLT: 'Tetapkan PLT',
  VIEW_HISTORY: 'Lihat riwayat',
};

export function normalizeStrukturTab(value: string | undefined): StrukturTab {
  return STRUCTURE_TABS.some((tab) => tab.id === value) ? value as StrukturTab : 'struktur';
}

export function appointmentStatusLabel(
  status: AppointmentStatus,
  isEffectiveNow = false,
  effectiveFrom?: string,
) {
  if (status === 'ACTIVE' && isEffectiveNow) return 'Aktif';
  if (status === 'APPROVED' && effectiveFrom && new Date(effectiveFrom) <= startOfTodayUtc()) {
    return 'Menunggu aktivasi';
  }
  return APPOINTMENT_STATUS_LABELS[status];
}

export function appointmentKindLabel(kind: AppointmentKind) {
  return kind === 'PLT' ? 'PLT' : 'Definitif';
}

export function formatAppointmentDate(value: string | null) {
  if (!value) return 'tanpa batas';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatAppointmentRange(from: string, until: string | null) {
  return `${formatAppointmentDate(from)} - ${formatAppointmentDate(until)}`;
}

export function validateAppointmentDraft(
  draft: AppointmentDraftForm,
  position: { scopeType: 'NONE' | 'MAJOR' } | null,
) {
  const errors: string[] = [];
  if (!draft.academicYearId) errors.push('Pilih tahun ajaran.');
  if (!draft.positionId) errors.push('Pilih jabatan.');
  if (position?.scopeType === 'MAJOR' && !draft.majorId) errors.push('Pilih jurusan untuk jabatan ini.');
  if (position?.scopeType === 'NONE' && draft.majorId) errors.push('Jabatan ini tidak memakai jurusan.');
  if (!draft.staffId) errors.push('Pilih pemangku.');
  if (!draft.effectiveFrom) errors.push('Isi tanggal mulai.');
  if (draft.effectiveUntil && draft.effectiveFrom && draft.effectiveUntil < draft.effectiveFrom) {
    errors.push('Tanggal akhir tidak boleh lebih awal dari tanggal mulai.');
  }
  if (draft.kind === 'PLT') {
    if (!draft.replacesAppointmentId) errors.push('PLT harus memilih appointment definitif yang ditangguhkan.');
    if (!draft.effectiveUntil) errors.push('PLT harus memiliki tanggal akhir.');
    if (draft.reason.trim().length < 3) errors.push('PLT harus memiliki alasan.');
  }
  return errors;
}

export function buildAppointmentCreatePayload(
  draft: AppointmentDraftForm,
  position: { scopeType: 'NONE' | 'MAJOR' } | null,
): AppointmentCreatePayload {
  const payload: AppointmentCreatePayload = {
    staffId: draft.staffId,
    positionId: draft.positionId,
    academicYearId: draft.academicYearId,
    kind: draft.kind,
    effectiveFrom: draft.effectiveFrom,
  };
  if (position?.scopeType === 'MAJOR' && draft.majorId) payload.majorId = draft.majorId;
  if (draft.effectiveUntil) payload.effectiveUntil = draft.effectiveUntil;
  if (draft.reason.trim()) payload.reason = draft.reason.trim();
  if (draft.replacesAppointmentId) payload.replacesAppointmentId = draft.replacesAppointmentId;
  return payload;
}

export function buildAppointmentReplacementDraft(
  source: AppointmentListItem,
  action: Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'>,
  fallbackAcademicYearId: string,
): AppointmentDraftForm {
  return {
    academicYearId: action === 'CREATE_SUCCESSOR'
      ? fallbackAcademicYearId || source.academicYear.id
      : source.academicYear.id || fallbackAcademicYearId,
    positionId: source.position.id,
    majorId: source.major?.id ?? '',
    staffId: '',
    kind: action === 'CREATE_PLT' ? 'PLT' : 'DEFINITIVE',
    effectiveFrom: '',
    effectiveUntil: action === 'CREATE_PLT' ? source.suspensionUntil ?? '' : '',
    reason: '',
    replacesAppointmentId: source.id,
  };
}

export function selectSuccessorAcademicYearId(
  years: AcademicYear[],
  sourceAcademicYearId: string,
  fallbackAcademicYearId: string,
) {
  const sourceYear = years.find((year) => year.id === sourceAcademicYearId);
  if (!sourceYear) return fallbackAcademicYearId || sourceAcademicYearId;

  const sourceStart = new Date(sourceYear.startDate).getTime();
  const nextYear = [...years]
    .filter((year) => year.id !== sourceAcademicYearId && new Date(year.startDate).getTime() > sourceStart)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];

  return nextYear?.id ?? (fallbackAcademicYearId || sourceAcademicYearId);
}

export interface PreviewGenerationRef {
  current: number;
}

export function advancePreviewGeneration(ref: PreviewGenerationRef) {
  ref.current += 1;
  return ref.current;
}

export function isCurrentPreviewGeneration(ref: PreviewGenerationRef, requestId: number) {
  return ref.current === requestId;
}

export interface AppointmentActionDialogFormState {
  note: string;
  date: string;
}

export function resetAppointmentActionDialogForm(): AppointmentActionDialogFormState {
  return { note: '', date: '' };
}

export function actionErrorText(result: { error?: string; status?: number }) {
  if (!result.error) return '';
  if (result.status === 409) return `${result.error} Muat ulang data sebelum mencoba lagi.`;
  if (result.status === 403) return `${result.error} Akun ini tidak memiliki kewenangan untuk aksi tersebut.`;
  return result.error;
}

export function actionableAppointments(items: AppointmentListItem[]) {
  return items.filter((item) =>
    item.allowedActions.some((action) => ['APPROVE', 'REJECT'].includes(action)),
  );
}

export function terminalAppointments(items: AppointmentListItem[]) {
  return items.filter((item) =>
    ['ENDED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'].includes(item.status),
  );
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
