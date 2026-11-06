import { z } from 'zod';

export const LearnerCredentialResultSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['SISWA', 'ORANG_TUA']),
  fullName: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  temporaryPassword: z.string().min(8).max(200),
  requiresPasswordChange: z.literal(true),
});
