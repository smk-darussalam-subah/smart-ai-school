import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  name: z.string().min(3).max(255).optional(),
  npsn: z.string().max(20).optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(100).optional().nullable(),
  website: z.string().max(255).optional().nullable(),
  headmasterName: z.string().max(255).optional().nullable(),
  headmasterNip: z.string().max(30).optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  accreditation: z.string().max(5).optional().nullable(),
}).strict();

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
