'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileClock,
  History,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TablePagination } from '@/components/ui/table-pagination';
import {
  ACTION_LABELS,
  STRUCTURE_TABS,
  actionErrorText,
  actionableAppointments,
  advancePreviewGeneration,
  appointmentKindLabel,
  appointmentStatusLabel,
  buildAppointmentCreatePayload,
  buildAppointmentReplacementDraft,
  formatAppointmentDate,
  formatAppointmentRange,
  isCurrentPreviewGeneration,
  resetAppointmentActionDialogForm,
  selectSuccessorAcademicYearId,
  terminalAppointments,
  validateAppointmentDraft,
  type AcademicYear,
  type AppointmentAction,
  type AppointmentCandidate,
  type AppointmentDetail,
  type AppointmentDraftForm,
  type AppointmentHistory,
  type AppointmentListItem,
  type AppointmentPermissionPreview,
  type AppointmentRegistryResponse,
  type AppointmentStatus,
  type Major,
  type Position,
  type PositionCapability,
  type StrukturTab,
} from '../struktur-ui';
import {
  appointmentCandidatesAction,
  appointmentDetailAction,
  appointmentHistoryAction,
  appointmentPermissionPreviewAction,
  approveAppointmentAction,
  cancelAppointmentAction,
  createAppointmentAction,
  endAppointmentAction,
  rejectAppointmentAction,
  resumeAppointmentAction,
  submitAppointmentAction,
  supersedeAppointmentAction,
  suspendAppointmentAction,
} from '../actions';

interface Props {
  tab: StrukturTab;
  roles: string[];
  positions: Position[];
  positionCapabilities: PositionCapability[];
  years: AcademicYear[];
  majors: Major[];
  selectedYearId: string;
  appointments: AppointmentRegistryResponse;
  structureAppointments: AppointmentListItem[];
  replacementAppointments: AppointmentListItem[];
  filters: {
    q: string;
    status: AppointmentStatus | '';
    positionId: string;
    majorId: string;
    kind: 'DEFINITIVE' | 'PLT' | '';
    page: number;
  };
}

const CATEGORY_ORDER = ['STRUKTURAL', 'FUNGSIONAL', 'TENDIK'];
const CATEGORY_LABELS: Record<string, string> = {
  STRUKTURAL: 'Struktural',
  FUNGSIONAL: 'Fungsional',
  TENDIK: 'Tenaga Kependidikan',
};
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
  PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-sky-200 bg-sky-50 text-sky-800',
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  SUSPENDED: 'border-slate-300 bg-slate-100 text-slate-800',
  ENDED: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  REJECTED: 'border-red-200 bg-red-50 text-red-700',
  CANCELLED: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  SUPERSEDED: 'border-zinc-200 bg-zinc-50 text-zinc-700',
};
const EMPTY_DRAFT: AppointmentDraftForm = {
  academicYearId: '',
  positionId: '',
  majorId: '',
  staffId: '',
  kind: 'DEFINITIVE',
  effectiveFrom: '',
  effectiveUntil: '',
  reason: '',
  replacesAppointmentId: '',
};

export default function StrukturClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [history, setHistory] = useState<AppointmentHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<AppointmentDraftForm>({
    ...EMPTY_DRAFT,
    academicYearId: props.selectedYearId,
  });
  const [candidates, setCandidates] = useState<AppointmentCandidate[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [preview, setPreview] = useState<AppointmentPermissionPreview | null>(null);
  const previewRequestIdRef = useRef(0);
  const [actionDialog, setActionDialog] = useState<{ action: AppointmentAction; item: AppointmentListItem } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const visibleYears = props.years.filter((year) => year.isActive || new Date(year.endDate) >= startOfTodayUtc());
  const capabilityByPositionId = useMemo(() => new Map(
    props.positionCapabilities.map((capability) => [capability.positionId, capability]),
  ), [props.positionCapabilities]);
  const preparablePositions = props.positions.filter((position) =>
    capabilityByPositionId.get(position.id)?.canPrepare,
  );
  const selectedPosition = props.positions.find((position) => position.id === draft.positionId) ?? null;
  const selectedCandidate = candidates.find((candidate) => candidate.staffId === draft.staffId) ?? null;
  const actionables = actionableAppointments(props.structureAppointments);
  const terminal = terminalAppointments(props.structureAppointments);
  const replacementOptions = useMemo(() => {
    const byId = new Map<string, AppointmentListItem>();
    for (const item of [...props.structureAppointments, ...props.replacementAppointments]) {
      byId.set(item.id, item);
    }
    return Array.from(byId.values());
  }, [props.structureAppointments, props.replacementAppointments]);

  const appointmentsByPosition = useMemo(() => {
    const map = new Map<string, AppointmentListItem[]>();
    for (const appointment of props.structureAppointments) {
      const list = map.get(appointment.position.id) ?? [];
      list.push(appointment);
      map.set(appointment.position.id, list);
    }
    return map;
  }, [props.structureAppointments]);

  function setQuery(next: Record<string, string | number | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '' || value === 1) params.delete(key);
      else params.set(key, String(value));
    }
    startTransition(() => router.replace(`/dashboard/struktur-organisasi?${params.toString()}`));
  }

  function invalidatePreviewRequest() {
    advancePreviewGeneration(previewRequestIdRef);
    setPreview(null);
  }

  function handleWizardOpenChange(open: boolean) {
    if (!open) invalidatePreviewRequest();
    setWizardOpen(open);
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetail(null);
    setHistory(null);
    setDetailLoading(true);
    const [detailResult, historyResult] = await Promise.all([
      appointmentDetailAction(id),
      appointmentHistoryAction(id),
    ]);
    setDetailLoading(false);
    if (detailResult.error) {
      toast.error(actionErrorText(detailResult));
      return;
    }
    if (historyResult.error) {
      toast.error(actionErrorText(historyResult));
    }
    setDetail(detailResult.data ?? null);
    setHistory(historyResult.data ?? null);
  }

  async function searchCandidates(search = candidateSearch) {
    setCandidateLoading(true);
    const result = await appointmentCandidatesAction({ search, limit: 20 });
    setCandidateLoading(false);
    if (result.error) {
      toast.error(actionErrorText(result));
      return;
    }
    setCandidates(result.data?.data ?? []);
  }

  async function loadPreview(nextDraft = draft) {
    const requestId = advancePreviewGeneration(previewRequestIdRef);
    setPreview(null);
    if (!nextDraft.positionId) {
      return;
    }
    const nextPosition = props.positions.find((position) => position.id === nextDraft.positionId) ?? null;
    if (!nextPosition || !nextDraft.academicYearId) {
      return;
    }
    if (nextPosition.scopeType === 'MAJOR' && !nextDraft.majorId) {
      return;
    }
    if (nextPosition.scopeType !== 'MAJOR' && nextDraft.majorId) {
      return;
    }
    const result = await appointmentPermissionPreviewAction(nextDraft.positionId, {
      academicYearId: nextDraft.academicYearId || props.selectedYearId,
      majorId: nextDraft.majorId || undefined,
    });
    if (!isCurrentPreviewGeneration(previewRequestIdRef, requestId)) {
      return;
    }
    if (result.error) {
      setPreview(null);
      toast.error(actionErrorText(result));
      return;
    }
    setPreview(result.data ?? null);
  }

  function openDraftWizard(nextDraft: AppointmentDraftForm, step = 0) {
    invalidatePreviewRequest();
    setDraft(nextDraft);
    setCandidateSearch('');
    setCandidates([]);
    setWizardStep(step);
    setWizardOpen(true);
    void searchCandidates('');
    if (nextDraft.positionId) void loadPreview(nextDraft);
  }

  function prepareReplacement(action: Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'>, item: AppointmentListItem) {
    const fallbackAcademicYearId = action === 'CREATE_SUCCESSOR'
      ? selectSuccessorAcademicYearId(props.years, item.academicYear.id, props.selectedYearId)
      : props.selectedYearId;
    openDraftWizard(buildAppointmentReplacementDraft(item, action, fallbackAcademicYearId), 1);
    setDetailId(null);
  }

  function openActionDialog(action: AppointmentAction, item: AppointmentListItem) {
    const nextForm = resetAppointmentActionDialogForm();
    setActionNote(nextForm.note);
    setActionDate(nextForm.date);
    setActionDialog({ action, item });
  }

  function closeActionDialog() {
    const nextForm = resetAppointmentActionDialogForm();
    setActionDialog(null);
    setActionNote(nextForm.note);
    setActionDate(nextForm.date);
  }

  async function saveDraft() {
    const errors = validateAppointmentDraft(draft, selectedPosition);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    const result = await createAppointmentAction(buildAppointmentCreatePayload(draft, selectedPosition));
    if (result.error) {
      toast.error(actionErrorText(result));
      return;
    }
    toast.success('Draft appointment tersimpan.');
    handleWizardOpenChange(false);
    setWizardStep(0);
    setDraft({ ...EMPTY_DRAFT, academicYearId: props.selectedYearId });
    if (result.data?.id) void openDetail(result.data.id);
    router.refresh();
  }

  async function runAction() {
    if (!actionDialog) return;
    setActionBusy(true);
    const { action, item } = actionDialog;
    const actionMap: Partial<Record<AppointmentAction, () => ReturnType<typeof submitAppointmentAction>>> = {
      SUBMIT: () => submitAppointmentAction(item.id),
      APPROVE: () => approveAppointmentAction(item.id, actionNote.trim() || undefined),
      REJECT: () => rejectAppointmentAction(item.id, actionNote.trim() || undefined),
      CANCEL: () => cancelAppointmentAction(item.id),
      RESUME: () => resumeAppointmentAction(item.id),
      SUPERSEDE: () => supersedeAppointmentAction(item.id, actionNote.trim() || undefined),
    };
    const complexAction = async () => {
      if (action === 'SUSPEND') {
        return suspendAppointmentAction(item.id, {
          reason: actionNote.trim(),
          expectedReturnDate: actionDate,
        });
      }
      if (action === 'END') {
        return endAppointmentAction(item.id, {
          reason: actionNote.trim(),
          effectiveUntil: actionDate || undefined,
        });
      }
      return null;
    };
    const result = actionMap[action] ? await actionMap[action]!() : await complexAction();
    setActionBusy(false);
    if (!result) return;
    if (result.error) {
      toast.error(actionErrorText(result));
      router.refresh();
      return;
    }
    toast.success(`${ACTION_LABELS[action]} berhasil diproses.`);
    closeActionDialog();
    router.refresh();
    if (detailId) void openDetail(detailId);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
            <Briefcase className="h-6 w-6 text-emerald-700" />
            Struktur & Jabatan
          </h1>
          <p className="mt-1 text-sm text-slate-500">Kelola masa jabatan per tahun ajaran dengan persetujuan dan riwayat yang jelas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <CalendarDays className="h-4 w-4" />
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={props.selectedYearId}
              onChange={(event) => setQuery({ yearId: event.target.value, page: 1 })}
            >
              {visibleYears.map((year) => (
                <option key={year.id} value={year.id}>{year.code}{year.isActive ? ' aktif' : ''}</option>
              ))}
            </select>
          </label>
          {preparablePositions.length > 0 && (
            <Button
              className="gap-2 bg-emerald-700 hover:bg-emerald-800"
              onClick={() => openDraftWizard({ ...EMPTY_DRAFT, academicYearId: props.selectedYearId })}
            >
              <Plus className="h-4 w-4" />
              Buat appointment
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STRUCTURE_TABS.map((item) => {
          const count = item.id === 'appointment'
            ? props.appointments.summary.all
            : item.id === 'persetujuan'
              ? actionables.length
              : item.id === 'riwayat'
                ? terminal.length
                : props.positions.length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setQuery({ tab: item.id, page: 1 })}
              className={clsx(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500',
                props.tab === item.id
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {item.label}
              <span className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      {isPending && (
        <div className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat data...
        </div>
      )}

      {props.tab === 'struktur' && (
        <StructureTab
          positions={props.positions}
          byPosition={appointmentsByPosition}
          onDetail={openDetail}
        />
      )}

      {props.tab === 'appointment' && (
        <AppointmentTab
          appointments={props.appointments}
          positions={props.positions}
          majors={props.majors}
          filters={props.filters}
          onQuery={setQuery}
          onDetail={openDetail}
          onAction={openActionDialog}
          onPrepare={prepareReplacement}
        />
      )}

      {props.tab === 'persetujuan' && (
        <ApprovalTab
          appointments={actionables}
          onDetail={openDetail}
          onAction={openActionDialog}
        />
      )}

      {props.tab === 'riwayat' && (
        <HistoryTab appointments={terminal} onDetail={openDetail} />
      )}

      <Sheet open={detailId !== null} onOpenChange={(open: boolean) => { if (!open) setDetailId(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Detail appointment</SheetTitle>
            <SheetDescription>Riwayat dan langkah berikutnya berdasarkan status terkini.</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat detail...
            </div>
          ) : detail ? (
            <DetailPanel
              detail={detail}
              history={history}
              onAction={openActionDialog}
              onPrepare={prepareReplacement}
            />
          ) : (
            <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Detail belum dapat dimuat. Coba buka ulang setelah data diperbarui.
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={wizardOpen} onOpenChange={handleWizardOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat appointment</DialogTitle>
            <DialogDescription>
              Siapkan draft appointment berdasarkan tahun ajaran, jabatan, pemangku, scope, dan masa berlaku.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-2">
              {['Jabatan dan tahun', 'Pemangku dan scope', 'Masa berlaku', 'Periksa dan simpan'].map((label, index) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => setWizardStep(index)}
                  className={clsx(
                    'h-2 rounded-full text-left text-[0px] focus:outline-none focus:ring-2 focus:ring-emerald-500',
                    wizardStep >= index ? 'bg-blue-600' : 'bg-slate-200',
                  )}
                  aria-label={label}
                />
              ))}
            </div>

            {wizardStep === 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="appointment-year" label="Tahun ajaran">
                  <select
                    id="appointment-year"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={draft.academicYearId}
                    onChange={(event) => {
                      const next = { ...draft, academicYearId: event.target.value };
                      setDraft(next);
                      void loadPreview(next);
                    }}
                  >
                    {visibleYears.map((year) => <option key={year.id} value={year.id}>{year.code}</option>)}
                  </select>
                </Field>
                <Field id="appointment-position" label="Jabatan">
                  <select
                    id="appointment-position"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={draft.positionId}
                    onChange={(event) => {
                      const next = { ...draft, positionId: event.target.value, majorId: '' };
                      setDraft(next);
                      void loadPreview(next);
                    }}
                  >
                    <option value="">Pilih jabatan</option>
                    {preparablePositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
                  </select>
                </Field>
                {selectedPosition?.scopeType === 'MAJOR' && (
                  <Field id="appointment-major" label="Jurusan">
                    <select
                      id="appointment-major"
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                      value={draft.majorId}
                      onChange={(event) => {
                        const next = { ...draft, majorId: event.target.value };
                        setDraft(next);
                        void loadPreview(next);
                      }}
                    >
                      <option value="">Pilih jurusan</option>
                      {props.majors.map((major) => <option key={major.id} value={major.id}>{major.code} - {major.name}</option>)}
                    </select>
                  </Field>
                )}
                <Field id="appointment-kind" label="Jenis">
                  <select
                    id="appointment-kind"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={draft.kind}
                    onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as 'DEFINITIVE' | 'PLT' }))}
                  >
                    <option value="DEFINITIVE">Definitif</option>
                    <option value="PLT">PLT</option>
                  </select>
                </Field>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    id="appointment-candidate-search"
                    value={candidateSearch}
                    onChange={(event) => setCandidateSearch(event.target.value)}
                    placeholder="Cari nama atau NIY..."
                  />
                  <Button type="button" variant="outline" onClick={() => searchCandidates()} disabled={candidateLoading}>
                    {candidateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="max-h-72 divide-y overflow-y-auto rounded-lg border border-slate-200">
                  {candidates.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">Cari pegawai aktif untuk appointment.</div>
                  ) : candidates.map((candidate) => (
                    <button
                      type="button"
                      key={candidate.staffId}
                      onClick={() => setDraft((current) => ({ ...current, staffId: candidate.staffId }))}
                      className={clsx(
                        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50',
                        draft.staffId === candidate.staffId && 'bg-emerald-50',
                      )}
                    >
                      <span>
                        <span className="block font-medium text-slate-900">{candidate.fullName}</span>
                        <span className="text-slate-500">{candidate.niy ?? 'NIY belum diisi'} - {candidate.stableRole}</span>
                      </span>
                      {draft.staffId === candidate.staffId && <Check className="h-4 w-4 text-emerald-700" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="appointment-effective-from" label="Tanggal mulai">
                  <Input id="appointment-effective-from" type="date" value={draft.effectiveFrom} onChange={(event) => setDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} />
                </Field>
                <Field id="appointment-effective-until" label="Tanggal akhir">
                  <Input id="appointment-effective-until" type="date" value={draft.effectiveUntil} onChange={(event) => setDraft((current) => ({ ...current, effectiveUntil: event.target.value }))} />
                </Field>
                <div className="md:col-span-2">
                  <Field id="appointment-reason" label="Alasan">
                    <Textarea id="appointment-reason" value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} rows={4} />
                  </Field>
                </div>
                {(draft.kind === 'PLT' || draft.replacesAppointmentId) && (
                  <Field id="appointment-replacement" label="Appointment yang digantikan">
                    <select
                      id="appointment-replacement"
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                      value={draft.replacesAppointmentId}
                      onChange={(event) => setDraft((current) => ({ ...current, replacesAppointmentId: event.target.value }))}
                    >
                      <option value="">Pilih appointment</option>
                      {replacementOptions
                        .filter((item) =>
                          item.position.id === draft.positionId &&
                          (selectedPosition?.scopeType !== 'MAJOR' || item.major?.id === draft.majorId) &&
                          (draft.kind === 'PLT'
                            ? item.kind === 'DEFINITIVE' && item.status === 'SUSPENDED'
                            : ['ACTIVE', 'SUSPENDED'].includes(item.status)))
                        .map((item) => (
                          <option key={item.id} value={item.id}>{item.staff.user.fullName} - {item.academicYear.code} - {appointmentStatusLabel(item.status)}</option>
                        ))}
                    </select>
                  </Field>
                )}
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p><span className="text-slate-500">Jabatan:</span> <b>{selectedPosition?.name ?? '-'}</b></p>
                  <p><span className="text-slate-500">Pemangku:</span> <b>{selectedCandidate?.fullName ?? '-'}</b></p>
                  <p><span className="text-slate-500">Masa berlaku:</span> <b>{draft.effectiveFrom || '-'} - {draft.effectiveUntil || 'tanpa batas'}</b></p>
                  <p><span className="text-slate-500">Jenis:</span> <b>{appointmentKindLabel(draft.kind)}</b></p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Kapasitas</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">
                      {preview?.occupancy ? `${preview.occupancy.activeCount}/${preview.occupancy.capacity}` : '-'}
                    </p>
                    <p className="text-sm text-slate-500">{preview?.occupancy?.preparedCount ?? 0} appointment disiapkan.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Izin saat aktif</p>
                    <p className="mt-2 text-sm text-slate-600">{preview?.permissions.length ?? 0} izin akan berlaku setelah appointment aktif.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button type="button" variant="outline" disabled={wizardStep === 0} onClick={() => setWizardStep((step) => Math.max(0, step - 1))}>Kembali</Button>
              {wizardStep < 3 ? (
                <Button type="button" onClick={() => setWizardStep((step) => Math.min(3, step + 1))}>Lanjut</Button>
              ) : (
                <Button type="button" className="bg-emerald-700 hover:bg-emerald-800" onClick={saveDraft}>Simpan draft</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog !== null} onOpenChange={(open: boolean) => { if (!open) closeActionDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{actionDialog ? ACTION_LABELS[actionDialog.action] : 'Aksi appointment'}</DialogTitle>
            <DialogDescription>
              Periksa konteks appointment sebelum menjalankan aksi lifecycle.
            </DialogDescription>
          </DialogHeader>
          {actionDialog && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {actionDialog.item.position.name} untuk <b>{actionDialog.item.staff.user.fullName}</b>.
                Status saat ini {appointmentStatusLabel(actionDialog.item.status, actionDialog.item.isEffectiveNow, actionDialog.item.effectiveFrom)}.
              </p>
              {['APPROVE', 'REJECT', 'SUSPEND', 'END', 'SUPERSEDE'].includes(actionDialog.action) && (
                <Field id="appointment-action-note" label={actionDialog.action === 'REJECT' ? 'Catatan penolakan' : 'Catatan'}>
                  <Textarea id="appointment-action-note" value={actionNote} onChange={(event) => setActionNote(event.target.value)} rows={3} />
                </Field>
              )}
              {['SUSPEND', 'END'].includes(actionDialog.action) && (
                <Field id="appointment-action-date" label={actionDialog.action === 'SUSPEND' ? 'Tanggal kembali' : 'Tanggal akhir'}>
                  <Input id="appointment-action-date" type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} />
                </Field>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeActionDialog}>Batal</Button>
                <Button onClick={runAction} disabled={actionBusy} className="bg-emerald-700 hover:bg-emerald-800">
                  {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : ACTION_LABELS[actionDialog.action]}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StructureTab({
  positions,
  byPosition,
  onDetail,
}: {
  positions: Position[];
  byPosition: Map<string, AppointmentListItem[]>;
  onDetail: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((category) => {
        const rows = positions.filter((position) => position.category === category);
        if (rows.length === 0) return null;
        return (
          <section key={category} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="h-px flex-1 bg-slate-200" />
              {CATEGORY_LABELS[category]}
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Jabatan</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Occupancy</th>
                    <th className="px-4 py-3">Aktif</th>
                    <th className="px-4 py-3">Disiapkan</th>
                    <th className="w-28 px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((position) => {
                    const appointments = byPosition.get(position.id) ?? [];
                    const active = appointments.filter((item) => item.status === 'ACTIVE');
                    const prepared = appointments.filter((item) => ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUSPENDED'].includes(item.status));
                    return (
                      <tr key={position.id} className="align-top">
                        <td className="px-4 py-3 font-medium text-slate-950">{position.name}</td>
                        <td className="px-4 py-3 text-slate-600">{position.scopeType === 'MAJOR' ? 'Per jurusan' : 'Sekolah'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold">
                            {active.length}/{position.maxActiveHolders}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{active.map((item) => item.staff.user.fullName).join(', ') || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {prepared.length === 0 ? <span className="text-slate-400">-</span> : prepared.slice(0, 3).map((item) => <StatusPill key={item.id} item={item} />)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" disabled={appointments.length === 0} onClick={() => appointments[0] && onDetail(appointments[0].id)}>
                            Detail
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AppointmentTab({
  appointments,
  positions,
  majors,
  filters,
  onQuery,
  onDetail,
  onAction,
  onPrepare,
}: {
  appointments: AppointmentRegistryResponse;
  positions: Position[];
  majors: Major[];
  filters: Props['filters'];
  onQuery: (next: Record<string, string | number | null>) => void;
  onDetail: (id: string) => void;
  onAction: (action: AppointmentAction, item: AppointmentListItem) => void;
  onPrepare: (action: Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'>, item: AppointmentListItem) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px_180px_150px]">
        <Input defaultValue={filters.q} placeholder="Cari pemangku, NIY, atau jabatan..." onKeyDown={(event) => {
          if (event.key === 'Enter') onQuery({ q: (event.currentTarget as HTMLInputElement).value, page: 1 });
        }} />
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={filters.status} onChange={(event) => onQuery({ status: event.target.value, page: 1 })}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_CLASS).map(([status]) => <option key={status} value={status}>{appointmentStatusLabel(status as AppointmentStatus)}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={filters.positionId} onChange={(event) => onQuery({ positionId: event.target.value, page: 1 })}>
          <option value="">Semua jabatan</option>
          {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={filters.majorId} onChange={(event) => onQuery({ majorId: event.target.value, page: 1 })}>
          <option value="">Semua scope</option>
          {majors.map((major) => <option key={major.id} value={major.id}>{major.code}</option>)}
        </select>
      </div>
      <AppointmentTable items={appointments.data} onDetail={onDetail} onAction={onAction} onPrepare={onPrepare} />
      <TablePagination page={appointments.page} limit={appointments.limit} total={appointments.total} onPage={(page) => onQuery({ page })} />
    </div>
  );
}

function AppointmentTable({
  items,
  onDetail,
  onAction,
  onPrepare,
}: {
  items: AppointmentListItem[];
  onDetail: (id: string) => void;
  onAction: (action: AppointmentAction, item: AppointmentListItem) => void;
  onPrepare: (action: Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'>, item: AppointmentListItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        Belum ada appointment pada filter ini.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Pemangku</th>
            <th className="px-4 py-3">Jabatan</th>
            <th className="px-4 py-3">Tahun</th>
            <th className="px-4 py-3">Tanggal</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Next action</th>
            <th className="w-16 px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-950">{item.staff.user.fullName}</p>
                <p className="text-xs text-slate-500">{item.staff.niy ?? 'NIY belum diisi'}</p>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{item.position.name}</p>
                <p className="text-xs text-slate-500">{item.major ? item.major.code : 'Sekolah'} - {appointmentKindLabel(item.kind)}</p>
              </td>
              <td className="px-4 py-3 text-slate-600">{item.academicYear.code}</td>
              <td className="px-4 py-3 text-slate-600">{formatAppointmentRange(item.effectiveFrom, item.effectiveUntil)}</td>
              <td className="px-4 py-3"><StatusPill item={item} /></td>
              <td className="px-4 py-3 text-slate-600">{item.allowedActions.filter((action) => action !== 'VIEW_HISTORY').map((action) => ACTION_LABELS[action]).join(', ') || 'Lihat riwayat'}</td>
              <td className="px-4 py-3">
                <ActionMenu item={item} onDetail={onDetail} onAction={onAction} onPrepare={onPrepare} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalTab({
  appointments,
  onDetail,
  onAction,
}: {
  appointments: AppointmentListItem[];
  onDetail: (id: string) => void;
  onAction: (action: AppointmentAction, item: AppointmentListItem) => void;
}) {
  if (appointments.length === 0) {
    return <EmptyState icon={BadgeCheck} text="Tidak ada appointment yang menunggu keputusan akun ini." />;
  }
  return (
    <div className="grid gap-3">
      {appointments.map((item) => (
        <div key={item.id} className="rounded-lg border border-amber-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-slate-950">{item.position.name} - {item.staff.user.fullName}</p>
              <p className="mt-1 text-sm text-slate-500">{item.major?.code ?? 'Sekolah'} - {formatAppointmentRange(item.effectiveFrom, item.effectiveUntil)}</p>
              <p className="mt-2 text-sm text-slate-600">{item.reason ?? 'Tidak ada catatan alasan.'}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onDetail(item.id)}>Detail</Button>
              {item.allowedActions.includes('REJECT') && <Button variant="outline" onClick={() => onAction('REJECT', item)}>Tolak</Button>}
              {item.allowedActions.includes('APPROVE') && <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => onAction('APPROVE', item)}>Setujui</Button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ appointments, onDetail }: { appointments: AppointmentListItem[]; onDetail: (id: string) => void }) {
  if (appointments.length === 0) {
    return <EmptyState icon={History} text="Belum ada appointment terminal untuk tahun ajaran ini." />;
  }
  return (
    <AppointmentTable items={appointments} onDetail={onDetail} onAction={() => undefined} onPrepare={() => undefined} />
  );
}

function DetailPanel({
  detail,
  history,
  onAction,
  onPrepare,
}: {
  detail: AppointmentDetail;
  history: AppointmentHistory | null;
  onAction: (action: AppointmentAction, item: AppointmentListItem) => void;
  onPrepare: (action: Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'>, item: AppointmentListItem) => void;
}) {
  const preparationActions = detail.allowedActions.filter((action): action is Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'> =>
    ['CREATE_SUCCESSOR', 'CREATE_PLT'].includes(action),
  );
  const mutationActions = detail.allowedActions.filter((action) =>
    !['VIEW_HISTORY', 'CREATE_SUCCESSOR', 'CREATE_PLT'].includes(action),
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Pemangku</p>
            <p className="text-xl font-bold text-slate-950">{detail.staff.user.fullName}</p>
            <p className="text-sm text-slate-600">{detail.position.name} - {detail.academicYear.code}</p>
          </div>
          <StatusPill item={detail} />
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <InfoCell label="Masa berlaku" value={formatAppointmentRange(detail.effectiveFrom, detail.effectiveUntil)} />
          <InfoCell label="Scope" value={detail.major?.code ?? 'Sekolah'} />
          <InfoCell label="Occupancy" value={`${detail.occupancy.activeCount}/${detail.occupancy.capacity}`} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Aksi berikutnya</p>
        <div className="flex flex-wrap gap-2">
          {preparationActions.map((action) => (
            <Button key={action} size="sm" variant="outline" onClick={() => onPrepare(action, detail)}>
              {ACTION_LABELS[action]}
            </Button>
          ))}
          {mutationActions.map((action) => (
            <Button key={action} size="sm" variant={action === 'APPROVE' ? 'default' : 'outline'} onClick={() => onAction(action, detail)}>
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-slate-900">Lifecycle</p>
        <div className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-slate-200">
          {(history?.timeline ?? []).map((item, index) => (
            <div key={`${item.action}-${item.occurredAt}-${index}`} className="relative">
              <span className={clsx('absolute -left-[17px] top-1 h-3 w-3 rounded-full border-2 bg-white', item.outcome === 'failure' ? 'border-red-400' : 'border-emerald-500')} />
              <p className="text-sm font-medium text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-500">{formatAppointmentDate(item.occurredAt)} - {item.actorName ?? 'Tidak tercatat'}</p>
              {item.note && <p className="mt-1 text-sm text-slate-600">{item.note}</p>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Izin setelah aktif</p>
        <div className="flex flex-wrap gap-2">
          {detail.permissions.length === 0 ? (
            <span className="text-sm text-slate-500">Tidak ada izin jabatan terdaftar.</span>
          ) : detail.permissions.map((permission) => (
            <span key={permission.code} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600">
              {permission.module}.{permission.code}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionMenu({
  item,
  onDetail,
  onAction,
  onPrepare,
}: {
  item: AppointmentListItem;
  onDetail: (id: string) => void;
  onAction: (action: AppointmentAction, item: AppointmentListItem) => void;
  onPrepare: (action: Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'>, item: AppointmentListItem) => void;
}) {
  const preparationActions = item.allowedActions.filter((action): action is Extract<AppointmentAction, 'CREATE_SUCCESSOR' | 'CREATE_PLT'> =>
    ['CREATE_SUCCESSOR', 'CREATE_PLT'].includes(action),
  );
  const actions = item.allowedActions.filter((action) => !['VIEW_HISTORY', 'CREATE_SUCCESSOR', 'CREATE_PLT'].includes(action));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Aksi appointment">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onDetail(item.id)}>
          <FileClock className="mr-2 h-4 w-4" /> Detail
        </DropdownMenuItem>
        {actions.map((action) => (
          <DropdownMenuItem key={action} onClick={() => onAction(action, item)}>
            {actionIcon(action)}
            {ACTION_LABELS[action]}
          </DropdownMenuItem>
        ))}
        {preparationActions.map((action) => (
          <DropdownMenuItem key={action} onClick={() => onPrepare(action, item)}>
            {actionIcon(action)}
            {ACTION_LABELS[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusPill({ item }: { item: Pick<AppointmentListItem, 'status' | 'isEffectiveNow' | 'effectiveFrom'> }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold', STATUS_CLASS[item.status])}>
      {appointmentStatusLabel(item.status, item.isEffectiveNow, item.effectiveFrom)}
    </span>
  );
}

function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
      <Icon className="h-8 w-8 text-slate-400" />
      <p className="mt-3 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function actionIcon(action: AppointmentAction) {
  const cls = 'mr-2 h-4 w-4';
  const icons: Partial<Record<AppointmentAction, ReactNode>> = {
    SUBMIT: <ChevronRight className={cls} />,
    APPROVE: <Check className={cls} />,
    REJECT: <X className={cls} />,
    CANCEL: <X className={cls} />,
    SUSPEND: <PauseCircle className={cls} />,
    RESUME: <RotateCcw className={cls} />,
    END: <Clock3 className={cls} />,
    SUPERSEDE: <Play className={cls} />,
    CREATE_SUCCESSOR: <Plus className={cls} />,
    CREATE_PLT: <Briefcase className={cls} />,
  };
  return icons[action] ?? <ShieldCheck className={cls} />;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
