import { z } from 'zod';

export const CreateCalendarEventSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().min(2).max(255),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  type: z.enum(['holiday', 'exam', 'event', 'break']),
  description: z.string().optional().nullable(),
}).strict();

export type CreateCalendarEventDto = z.infer<typeof CreateCalendarEventSchema>;

export const UpdateCalendarEventSchema = CreateCalendarEventSchema.partial();

export type UpdateCalendarEventDto = z.infer<typeof UpdateCalendarEventSchema>;
