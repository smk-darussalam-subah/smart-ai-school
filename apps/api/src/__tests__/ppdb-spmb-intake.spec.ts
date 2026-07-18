import { SubmitSpmbIntakeSchema } from '../ppdb/dto/submit-lead.dto';

const VALID_SPMB_INTAKE_DTO = {
  idempotencyKey: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  applicantRole: 'guardian',
  fullName: 'Alya Rahma Putri',
  gender: 'P',
  nisn: '1234567890',
  schoolOrigin: 'SMP Negeri 2 Subah',
  interestMajor: 'TKJ',
  guardianName: 'Siti Aminah',
  guardianRelation: 'Ibu',
  phone: '6281234567890',
  email: 'wali@example.sch.id',
  consent: true,
} as const;

describe('SubmitSpmbIntakeSchema', () => {
  it('payload lengkap lolos dan phone dinormalisasi', () => {
    const result = SubmitSpmbIntakeSchema.safeParse({
      ...VALID_SPMB_INTAKE_DTO,
      phone: '0812-3456-7890',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('6281234567890');
      expect(result.data.consent).toBe(true);
    }
  });

  it('idempotencyKey wajib berbentuk UUID', () => {
    const withoutKey: Record<string, unknown> = { ...VALID_SPMB_INTAKE_DTO };
    delete withoutKey.idempotencyKey;
    expect(SubmitSpmbIntakeSchema.safeParse(withoutKey).success).toBe(false);

    expect(
      SubmitSpmbIntakeSchema.safeParse({
        ...VALID_SPMB_INTAKE_DTO,
        idempotencyKey: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('gender wajib untuk intake V2', () => {
    const payload: Record<string, unknown> = { ...VALID_SPMB_INTAKE_DTO };
    delete payload.gender;

    const result = SubmitSpmbIntakeSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });

  it('consent wajib true dan email kosong tetap boleh', () => {
    const withoutEmail = SubmitSpmbIntakeSchema.safeParse({
      ...VALID_SPMB_INTAKE_DTO,
      email: '',
    });
    expect(withoutEmail.success).toBe(true);
    if (withoutEmail.success) expect(withoutEmail.data.email).toBeUndefined();

    const noConsent = SubmitSpmbIntakeSchema.safeParse({
      ...VALID_SPMB_INTAKE_DTO,
      consent: false,
    });
    expect(noConsent.success).toBe(false);
  });

  it('NISN malformed ditolak jika diisi', () => {
    const result = SubmitSpmbIntakeSchema.safeParse({
      ...VALID_SPMB_INTAKE_DTO,
      nisn: '12345',
    });

    expect(result.success).toBe(false);
  });

  it('captchaToken ditolak karena provider CAPTCHA belum aktif di wave ini', () => {
    const result = SubmitSpmbIntakeSchema.safeParse({
      ...VALID_SPMB_INTAKE_DTO,
      captchaToken: 'fake-token',
    });

    expect(result.success).toBe(false);
  });
});
