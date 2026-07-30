import {
  actionErrorText,
  appointmentStatusLabel,
  buildAppointmentCreatePayload,
  formatAppointmentDate,
  normalizeStrukturTab,
  validateAppointmentDraft,
  type AppointmentDraftForm,
} from '../app/dashboard/struktur-organisasi/struktur-ui';

describe('struktur organisasi appointment UI helpers', () => {
  it('labels effective active appointment as effective authority', () => {
    expect(appointmentStatusLabel('ACTIVE', true)).toBe('Aktif');
  });

  it('keeps non-effective lifecycle status visible', () => {
    expect(appointmentStatusLabel('APPROVED', false, '2999-01-01')).toBe('Disetujui - belum berlaku');
    expect(appointmentStatusLabel('SUSPENDED', false)).toBe('Ditangguhkan');
  });

  it('formats open-ended appointment dates clearly', () => {
    expect(formatAppointmentDate(null)).toBe('tanpa batas');
  });

  it('normalizes tab query state to a stable default', () => {
    expect(normalizeStrukturTab('persetujuan')).toBe('persetujuan');
    expect(normalizeStrukturTab('unknown')).toBe('struktur');
  });

  it('builds create payload with staffId, not userId', () => {
    const draft: AppointmentDraftForm = {
      academicYearId: 'ay-1',
      positionId: 'pos-1',
      majorId: '',
      staffId: 'staff-1',
      kind: 'DEFINITIVE',
      effectiveFrom: '2026-07-01',
      effectiveUntil: '',
      reason: 'Rotasi',
      replacesAppointmentId: '',
    };

    expect(buildAppointmentCreatePayload(draft, { scopeType: 'NONE' })).toEqual({
      academicYearId: 'ay-1',
      effectiveFrom: '2026-07-01',
      kind: 'DEFINITIVE',
      positionId: 'pos-1',
      reason: 'Rotasi',
      staffId: 'staff-1',
    });
  });

  it('validates PLT replacement, reason, and end date rules', () => {
    const draft: AppointmentDraftForm = {
      academicYearId: 'ay-1',
      positionId: 'pos-1',
      majorId: '',
      staffId: 'staff-1',
      kind: 'PLT',
      effectiveFrom: '2026-07-01',
      effectiveUntil: '',
      reason: '',
      replacesAppointmentId: '',
    };

    expect(validateAppointmentDraft(draft, { scopeType: 'NONE' })).toEqual(
      expect.arrayContaining([
        'PLT harus memilih appointment definitif yang ditangguhkan.',
        'PLT harus memiliki tanggal akhir.',
        'PLT harus memiliki alasan.',
      ]),
    );
  });

  it('adds refresh guidance for conflict errors', () => {
    expect(actionErrorText({ status: 409, error: 'Kapasitas jabatan penuh.' }))
      .toContain('Muat ulang data');
  });
});
