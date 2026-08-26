import { z } from 'zod';

export const OperationalMonitoringQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    classId: z.string().uuid().optional(),
    status: z
      .enum([
        'SCHEDULED',
        'REASSIGNED',
        'STARTED',
        'COMPLETED',
        'MISSED',
        'CANCELLED',
        'SUPERSEDED',
      ])
      .optional(),
  })
  .strict();

export const DeviceDeliveryAcknowledgementSchema = z
  .object({
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .strict();

export const DevicePlaybackClaimSchema = z
  .object({
    claimToken: z.string().uuid(),
  })
  .strict();
