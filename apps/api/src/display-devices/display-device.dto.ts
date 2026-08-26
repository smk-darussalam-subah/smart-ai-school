import { z } from 'zod';

export const DisplayProfileSchema = z.enum(['RUANG_GURU', 'RUANG_TU']);

export const CreateDisplayPairingSchema = z.object({
  profile: DisplayProfileSchema,
  label: z.string().trim().min(2).max(100),
  audioEnabled: z.boolean().default(false),
  credentialExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.profile === 'RUANG_TU' && value.audioEnabled) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['audioEnabled'], message: 'Audio hanya tersedia untuk Ruang Guru' });
  }
});
export type CreateDisplayPairingDto = z.infer<typeof CreateDisplayPairingSchema>;

export const RotateDisplayCredentialSchema = z.object({
  credentialExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();
export type RotateDisplayCredentialDto = z.infer<typeof RotateDisplayCredentialSchema>;

export const ActivateDisplayDeviceSchema = z.object({
  deviceId: z.string().uuid(),
  pairingCode: z.string().trim().min(10).max(32).regex(/^[A-Za-z0-9_-]+$/),
}).strict();
export type ActivateDisplayDeviceDto = z.infer<typeof ActivateDisplayDeviceSchema>;

export const SetAudibleLeaderSchema = z.object({
  enabled: z.boolean(),
}).strict();

export const DisplayAcknowledgementSchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
}).strict();

export const DisplayDeliveryTransitionSchema = z.object({
  deliveryId: z.string().uuid(),
}).strict();
