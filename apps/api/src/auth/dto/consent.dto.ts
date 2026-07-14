import { z } from 'zod';

/**
 * DTO for recording PDP consent (LoA acceptance).
 * `version` is the LoA version string (e.g. "v1.0") that the user accepted.
 * strict() ensures no extra fields can be injected.
 */
export const ConsentSchema = z
  .object({
    version: z.string().min(1).max(20),
  })
  .strict();

export type ConsentDto = z.infer<typeof ConsentSchema>;
