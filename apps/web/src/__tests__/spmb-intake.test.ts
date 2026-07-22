import {
  buildPublicProof,
  buildSpmbSubmitPayload,
  canSubmitSpmbDraft,
  createInitialSpmbDraft,
  normalizeIndonesianPhone,
  proofContainsSensitiveFields,
  type PublicIntakeReceipt,
  type SpmbIntakeDraft,
  validateSpmbStep,
} from '@/app/spmb/spmb-intake';

function validDraft(overrides: Partial<SpmbIntakeDraft> = {}): SpmbIntakeDraft {
  return {
    idempotencyKey: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    applicantRole: 'guardian',
    fullName: 'Alya Rahma Putri',
    gender: 'P',
    nisn: '1234567890',
    schoolOrigin: 'SMP Negeri 2 Subah',
    interestMajor: 'TKJ',
    guardianName: 'Siti Aminah',
    guardianRelation: 'Ibu',
    phone: '0812-3456-7890',
    email: 'wali@example.sch.id',
    consent: true,
    ...overrides,
  };
}

describe('SPMB intake wizard utilities', () => {
  it('initial draft keeps consent unchecked', () => {
    expect(createInitialSpmbDraft().consent).toBe(false);
    expect(createInitialSpmbDraft('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa').idempotencyKey).toBe(
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    );
  });

  it('validates required gender and school fields on student step', () => {
    const errors = validateSpmbStep(1, validDraft({ fullName: '', gender: '', schoolOrigin: '' }));

    expect(errors.fullName).toBeDefined();
    expect(errors.gender).toBeDefined();
    expect(errors.schoolOrigin).toBeDefined();
  });

  it('requires consent on review before submit', () => {
    expect(canSubmitSpmbDraft(validDraft())).toBe(true);
    expect(canSubmitSpmbDraft(validDraft({ consent: false }))).toBe(false);
  });

  it('normalizes phone and omits blank optional fields from submit payload', () => {
    expect(normalizeIndonesianPhone('+62812 3456 7890')).toBe('6281234567890');

    const payload = buildSpmbSubmitPayload(validDraft({ email: '', nisn: '' }));

    expect(payload.phone).toBe('6281234567890');
    expect(payload.idempotencyKey).toBe('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('nisn');
  });

  it('builds public proof without WA, NISN, or email exposure', () => {
    const receipt: PublicIntakeReceipt = {
      id: '11111111-2222-4333-8444-555555555555',
      status: 'new',
      registrationNo: 'SPMB-2027-11111111',
      submittedAt: '2026-07-19T03:24:00.000Z',
    };

    const proof = buildPublicProof(receipt, validDraft());

    expect(proof).toMatchObject({
      registrationNo: 'SPMB-2027-11111111',
      fullName: 'Alya Rahma Putri',
      gender: 'Perempuan',
      status: 'Menunggu verifikasi panitia',
    });
    expect(proofContainsSensitiveFields(proof)).toBe(false);
  });
});
