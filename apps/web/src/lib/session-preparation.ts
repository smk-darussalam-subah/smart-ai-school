import { z } from 'zod';

const count = z.number().int().nonnegative();
const schoolDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
export const SessionPreparationSchema = z
  .object({
    date: schoolDate,
    academicYear: z.string().trim().min(1),
    semester: z.union([z.literal(1), z.literal(2)]),
    scheduledCount: count,
    eligibleCount: count,
    existingCount: count,
    newCount: count,
    skippedStartedCount: count,
    skippedExpiredCount: count,
    firstStartAt: z.string().datetime({ offset: true }).nullable(),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    (plan) =>
      plan.eligibleCount === plan.existingCount + plan.newCount &&
      plan.scheduledCount === plan.eligibleCount + plan.skippedStartedCount,
  );

export const SessionPreparationReceiptSchema = z
  .object({
    date: schoolDate,
    createdCount: count,
    totalCount: count,
  })
  .refine((receipt) => receipt.createdCount <= receipt.totalCount);

export type SessionPreparation = z.infer<typeof SessionPreparationSchema>;
export type SessionPreparationReceipt = z.infer<typeof SessionPreparationReceiptSchema>;

export const SessionActivationRefSchema = z
  .object({ semesterId: z.string().uuid(), enabled: z.boolean(), revision: count })
  .refine((value) => !value.enabled || value.revision > 0);
export const SessionActivationSchema = SessionActivationRefSchema.and(
  z.object({
    academicYear: z.string().min(1),
    semester: z.union([z.literal(1), z.literal(2)]),
    date: schoolDate,
    activatedAt: z.string().datetime({ offset: true }).nullable(),
  }),
).refine((value) => !value.enabled || value.activatedAt !== null);
export const SessionActivationPreviewSchema = SessionPreparationSchema.and(
  z.object({ activation: SessionActivationRefSchema }),
);
export const SessionActivationReceiptSchema = SessionPreparationReceiptSchema.and(
  z.object({ activation: SessionActivationRefSchema }),
);
export type SessionActivation = z.infer<typeof SessionActivationSchema>;
export type SessionActivationPreview = z.infer<typeof SessionActivationPreviewSchema>;
