import { z } from 'zod';

export const ConcurrencySchema = z.object({
  anchorScheduleId: z.string().uuid(),
  mode: z.enum(['JOINT_CLASS', 'AUTHORIZED_EXCEPTION']),
  reason: z.string().trim().min(10).max(500),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine((value) => value.mode !== 'AUTHORIZED_EXCEPTION' || Boolean(value.expiresOn), {
  message: 'Pengecualian wajib memiliki tanggal berakhir', path: ['expiresOn'],
});

export const CreateScheduleSchema = z
  .object({
    classId:              z.string().uuid(),
    teachingAssignmentId: z.string().uuid(),
    // 1=Senin .. 6=Sabtu; raw value — libur/kalender akademik diatur konsumen
    dayOfWeek:            z.number().int().min(1).max(6),
    // jam pelajaran ke-N (bukan jam dinding) — pemetaan JP→jam ada di config sekolah
    jpStart:              z.number().int().min(1),
    jpEnd:                z.number().int().min(1),
    // nullable — sekolah kecil mungkin belum pakai ruang terstruktur
    room:                 z.string().max(50).nullable().optional(),
    academicYear:         z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
    semester:             z.number().int().min(1).max(2),
    concurrency: ConcurrencySchema.optional(),
  })
  .strict()
  .refine((d) => d.jpEnd >= d.jpStart, {
    message: 'jpEnd harus >= jpStart',
    path: ['jpEnd'],
  });

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;
