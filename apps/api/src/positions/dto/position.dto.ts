// =============================================================================
// position.dto.ts — DTO penugasan jabatan (2J-5)
// =============================================================================

import { z } from 'zod';

export const AssignPositionSchema = z.object({
  userId: z.string().uuid(),
  positionId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  majorId: z.string().uuid().optional(),
}).strict();

export type AssignPositionDto = z.infer<typeof AssignPositionSchema>;
