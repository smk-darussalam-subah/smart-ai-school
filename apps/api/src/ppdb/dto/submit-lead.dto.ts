import { z } from 'zod';

const IndonesianPhoneSchema = z
  .string()
  .transform((val) => {
    // Normalize common Indonesian WA/phone input before validation.
    const s = val.replace(/[\s\-().]/g, '');
    if (s.startsWith('+62')) return s.slice(1);
    if (s.startsWith('0')) return '62' + s.slice(1);
    return s;
  })
  .refine(
    (val) => /^62\d{8,12}$/.test(val),
    'Format nomor HP tidak valid. Contoh: 08123456789, +6281234567890, atau 6281234567890',
  );

const OptionalEmailSchema = z
  .union([
    z.string().trim().email('Format email tidak valid').max(255),
    z.literal('').transform(() => undefined),
  ])
  .optional();

const OptionalNisnSchema = z
  .union([
    z.string().trim().regex(/^\d{10}$/, 'NISN harus berisi 10 digit angka'),
    z.literal('').transform(() => undefined),
  ])
  .optional();

/**
 * DTO untuk POST /ppdb/leads - form publik calon siswa.
 *
 * Field _hp adalah honeypot: wajib kosong. Bot yang mengisi semua field akan
 * mengisi _hp sehingga request ditolak. .strict() menolak field tidak dikenal.
 */
export const SubmitLeadSchema = z
  .object({
    fullName: z.string().min(2).max(255),
    phone: IndonesianPhoneSchema,
    schoolOrigin: z.string().max(255).optional(),
    interestMajor: z.enum(['AKL', 'TKJ', 'TKRO', 'TBSM']).optional(),
    source: z
      .enum(['chatbot_wa', 'website', 'referral', 'instagram', 'tiktok', 'event', 'walk_in', 'other'])
      .default('other'),
    notes: z.string().max(1000).optional(),
    _hp: z.string().max(0, 'Field ini harus kosong').optional(),
  })
  .strict();

export type SubmitLeadDto = z.infer<typeof SubmitLeadSchema>;

/**
 * DTO khusus wizard publik SPMB 2027/2028 V2.
 *
 * Endpoint ini lebih ketat daripada lead ringan karena menjadi source of truth
 * daftar awal. Dokumen/daftar ulang tetap membutuhkan schema dan storage wave
 * tersendiri; data tambahan sementara disimpan sebagai metadata namespaced.
 */
export const SubmitSpmbIntakeSchema = z
  .object({
    idempotencyKey: z.string().uuid('Kunci idempotensi tidak valid'),
    applicantRole: z.enum(['guardian', 'student']),
    fullName: z.string().trim().min(2, 'Nama calon siswa wajib diisi').max(255),
    gender: z.enum(['L', 'P'], { required_error: 'Pilih jenis kelamin terlebih dahulu' }),
    nisn: OptionalNisnSchema,
    schoolOrigin: z.string().trim().min(2, 'Asal sekolah wajib diisi').max(255),
    interestMajor: z.enum(['AKL', 'TKJ', 'TKRO', 'TBSM'], {
      required_error: 'Pilih jurusan minat terlebih dahulu',
    }),
    guardianName: z.string().trim().min(2, 'Nama orang tua/wali wajib diisi').max(255),
    guardianRelation: z.string().trim().min(2, 'Hubungan dengan calon siswa wajib diisi').max(60),
    phone: IndonesianPhoneSchema,
    email: OptionalEmailSchema,
    consent: z.boolean().refine((value) => value === true, 'Persetujuan pemrosesan data wajib disetujui'),
    _hp: z.string().max(0, 'Field ini harus kosong').optional(),
  })
  .strict();

export type SubmitSpmbIntakeDto = z.infer<typeof SubmitSpmbIntakeSchema>;
