import { z } from 'zod';

/**
 * DTO untuk POST /ppdb/leads — form publik calon siswa.
 *
 * Field _hp adalah HONEYPOT: wajib kosong.
 * Bot yang mengisi semua field akan mengisi _hp → request ditolak 400.
 * Form UI menyembunyikan field ini via CSS (bukan display:none — bot bypass itu).
 *
 * .strict() menolak field tak dikenal → mencegah field injection.
 */
export const SubmitLeadSchema = z
  .object({
    fullName: z.string().min(2).max(255),
    phone: z
      .string()
      .regex(/^62\d{8,12}$/, 'Nomor HP harus diawali 62 dan terdiri 10-14 digit'),
    schoolOrigin: z.string().max(255).optional(),
    interestMajor: z.enum(['AKL', 'TKJ', 'TKRO', 'TBSM']).optional(),
    source: z
      .enum(['chatbot_wa', 'website', 'referral', 'instagram', 'tiktok', 'event', 'walk_in', 'other'])
      .default('other'),
    notes: z.string().max(1000).optional(),
    // Honeypot — harus kosong. Bot mengisi ini → ditolak.
    _hp: z.string().max(0, 'Field ini harus kosong').optional(),
    // Captcha token — opsional, diaktifkan via env PPDB_CAPTCHA_SECRET
    captchaToken: z.string().optional(),
  })
  .strict();

export type SubmitLeadDto = z.infer<typeof SubmitLeadSchema>;
