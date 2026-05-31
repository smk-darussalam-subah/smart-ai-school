import { z } from 'zod';

export const AssignLeadSchema = z
  .object({
    assignedTo: z.string().uuid().nullable(),
  })
  .strict();

export type AssignLeadDto = z.infer<typeof AssignLeadSchema>;
