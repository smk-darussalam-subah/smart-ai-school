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
      .transform((val) => {
        // Normalisasi sebelum validasi — tangani format umum yang diketik pengguna:
        //   0812...   → 62812...    (format lokal Indonesia)
        //   +62812... → 62812...   (format internasional dengan +)
        //   62812...  → 62812...   (sudah benar, biarkan)
        const s = val.replace(/[\s\-().]/g, ''); // strip spasi, dash, tanda kurung, titik
        if (s.startsWith('+62')) return s.slice(1); // hapus +
        if (s.startsWith('0')) return '62' + s.slice(1); // ganti 0 → 62
        return s;
      })
      .refine(
        (val) => /^62\d{8,12}$/.test(val),
        'Format nomor HP tidak valid. Contoh: 08123456789, +6281234567890, atau 6281234567890',
      ),
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
