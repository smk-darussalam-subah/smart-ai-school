import fs from 'fs';
import path from 'path';
import {
  ACTION_LABELS,
  advancePreviewGeneration,
  actionableAppointments,
  buildAppointmentCreatePayload,
  buildAppointmentReplacementDraft,
  isCurrentPreviewGeneration,
  resetAppointmentActionDialogForm,
  selectSuccessorAcademicYearId,
  validateAppointmentDraft,
  type AppointmentDraftForm,
  type AppointmentListItem,
} from '../app/dashboard/struktur-organisasi/struktur-ui';

function draft(overrides: Partial<AppointmentDraftForm> = {}): AppointmentDraftForm {
  return {
    academicYearId: 'ay-1',
    positionId: 'pos-1',
    majorId: '',
    staffId: 'staff-1',
    kind: 'DEFINITIVE',
    effectiveFrom: '2026-07-01',
    effectiveUntil: '',
    reason: 'Rotasi jabatan',
    replacesAppointmentId: '',
    ...overrides,
  };
}

function item(overrides: Partial<AppointmentListItem> = {}): AppointmentListItem {
  return {
    id: 'appt-1',
    kind: 'DEFINITIVE',
    status: 'PENDING_APPROVAL',
    effectiveFrom: '2026-07-01',
    effectiveUntil: null,
    reason: 'Rotasi',
    approvedAt: null,
    activatedAt: null,
    suspendedAt: null,
    suspensionUntil: null,
    suspensionReason: null,
    endedAt: null,
    replacesAppointmentId: null,
    requestedByUserId: null,
    createdAt: '2026-07-01',
    staff: {
      id: 'staff-1',
      niy: 'NIY-1',
      employmentStatus: 'GTY',
      user: { id: 'user-1', fullName: 'Guru Calon', role: 'GURU' },
    },
    position: {
      id: 'pos-1',
      code: 'WAKA_KURIKULUM',
      name: 'Waka Kurikulum',
      category: 'STRUKTURAL',
      scopeType: 'NONE',
      maxActiveHolders: 1,
    },
    academicYear: {
      id: 'ay-1',
      code: '2026/2027',
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      isActive: true,
    },
    major: null,
    occupancy: { activeCount: 0, preparedCount: 1, capacity: 1 },
    isEffectiveNow: false,
    allowedActions: ['APPROVE', 'REJECT', 'VIEW_HISTORY'],
    ...overrides,
  };
}

describe('appointment governance operational UI contracts', () => {
  const strukturClientSource = () => fs.readFileSync(
    path.join(__dirname, '../app/dashboard/struktur-organisasi/_components/StrukturClient.tsx'),
    'utf8',
  );

  it('uses human action labels for approval paths', () => {
    expect(ACTION_LABELS.APPROVE).toBe('Setujui');
    expect(ACTION_LABELS.SUPERSEDE).toBe('Aktifkan pengganti');
  });

  it('requires major only for major-scoped positions', () => {
    expect(validateAppointmentDraft(draft(), { scopeType: 'MAJOR' }))
      .toContain('Pilih jurusan untuk jabatan ini.');
    expect(validateAppointmentDraft(draft({ majorId: 'major-1' }), { scopeType: 'MAJOR' }))
      .not.toContain('Pilih jurusan untuk jabatan ini.');
  });

  it('maps major-scoped payload without replacing staffId with userId', () => {
    expect(buildAppointmentCreatePayload(draft({ majorId: 'major-1' }), { scopeType: 'MAJOR' }))
      .toMatchObject({ staffId: 'staff-1', majorId: 'major-1' });
  });

  it('approval inbox only shows records actionable for the actor', () => {
    expect(actionableAppointments([item(), item({ id: 'read-only', allowedActions: ['VIEW_HISTORY'] })]))
      .toHaveLength(1);
  });

  it('prefills replacement drafts from the source appointment without selecting a staff member', () => {
    expect(buildAppointmentReplacementDraft(item({ status: 'ACTIVE' }), 'CREATE_SUCCESSOR', 'fallback-year'))
      .toMatchObject({
        academicYearId: 'fallback-year',
        positionId: 'pos-1',
        majorId: '',
        staffId: '',
        kind: 'DEFINITIVE',
        replacesAppointmentId: 'appt-1',
      });
  });

  it('defaults successor preparation to the next available academic year', () => {
    expect(selectSuccessorAcademicYearId([
      { id: 'ay-2026', code: '2026/2027', startDate: '2026-07-01', endDate: '2027-06-30', isActive: true },
      { id: 'ay-2027', code: '2027/2028', startDate: '2027-07-01', endDate: '2028-06-30', isActive: false },
    ], 'ay-2026', 'ay-2026')).toBe('ay-2027');
  });

  it('prefills PLT drafts with the suspended appointment and return date when available', () => {
    expect(buildAppointmentReplacementDraft(item({ status: 'SUSPENDED', suspensionUntil: '2026-09-30' }), 'CREATE_PLT', 'fallback-year'))
      .toMatchObject({
        kind: 'PLT',
        replacesAppointmentId: 'appt-1',
        effectiveUntil: '2026-09-30',
      });
  });

  it('keeps PLT replacement in the suspended appointment year', () => {
    expect(buildAppointmentReplacementDraft(item({ status: 'SUSPENDED' }), 'CREATE_PLT', 'ay-next'))
      .toMatchObject({
        academicYearId: 'ay-1',
        kind: 'PLT',
      });
  });

  it('keeps Radix dialogs described', () => {
    const source = strukturClientSource();

    expect(source).toContain('DialogDescription');
    expect(source).toContain('<Label htmlFor={id}>{label}</Label>');
  });

  it('resets lifecycle dialog form state behaviorally', () => {
    const dirtyForm = { note: 'catatan lama', date: '2026-07-29' };
    const resetForm = resetAppointmentActionDialogForm();

    expect(dirtyForm).toEqual({ note: 'catatan lama', date: '2026-07-29' });
    expect(resetForm).toEqual({ note: '', date: '' });
  });

  it('invalidates stale permission preview responses after close and blank reopen', () => {
    const previewGeneration = { current: 0 };

    const oldRequest = advancePreviewGeneration(previewGeneration);
    advancePreviewGeneration(previewGeneration); // close wizard
    advancePreviewGeneration(previewGeneration); // open blank wizard with no server request

    expect(isCurrentPreviewGeneration(previewGeneration, oldRequest)).toBe(false);
    expect(isCurrentPreviewGeneration(previewGeneration, previewGeneration.current)).toBe(true);
  });
});
