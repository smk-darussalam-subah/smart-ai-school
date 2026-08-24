import { z } from 'zod';

export const CalendarEventTypeSchema = z.enum(['holiday', 'exam', 'event', 'break']);

const OptionalDescriptionSchema = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => (value.length > 0 ? value : null))
  .optional()
  .nullable();

export const CreateCalendarEventSchema = z
  .object({
    academicYearId: z.string().uuid(),
    name: z.string().trim().min(2).max(255),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    type: CalendarEventTypeSchema,
    description: OptionalDescriptionSchema,
  })
  .strict()
  .refine((data) => data.endDate >= data.startDate, {
    message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
    path: ['endDate'],
  });

export type CreateCalendarEventDto = z.infer<typeof CreateCalendarEventSchema>;

export const UpdateCalendarEventSchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(255).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    type: CalendarEventTypeSchema.optional(),
    description: OptionalDescriptionSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diubah',
  });

export type UpdateCalendarEventDto = z.infer<typeof UpdateCalendarEventSchema>;

export const ListCalendarEventsQuerySchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
    type: CalendarEventTypeSchema.optional(),
  })
  .strict();

export type ListCalendarEventsQuery = z.infer<typeof ListCalendarEventsQuerySchema>;
