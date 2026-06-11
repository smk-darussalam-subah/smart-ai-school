import { z } from 'zod';

// Update slot: hanya atribut slot (hari/JP/ruang/semester) — TIDAK boleh ganti
// kelas/penugasan (hapus + buat ulang bila perlu, menjaga validasi assignment).
export const UpdateScheduleSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(6).optional(),
    jpStart:   z.number().int().min(1).optional(),
    jpEnd:     z.number().int().min(1).optional(),
    room:      z.string().max(50).nullable().optional(),
    semester:  z.number().int().min(1).max(2).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Minimal satu field' });

export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;
