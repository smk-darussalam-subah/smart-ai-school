import { z } from 'zod';

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
  })
  .strict()
  .refine((d) => d.jpEnd >= d.jpStart, {
    message: 'jpEnd harus >= jpStart',
    path: ['jpEnd'],
  });

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;
