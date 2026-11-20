import { z } from 'zod';

const resultsSchema = z.object({
  session: z.object({ id: z.string(), status: z.literal('active') }),
  classStudentCount: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  pendingManualCount: z.number().int().nonnegative(),
  pendingLateReviewCount: z.number().int().nonnegative(),
  responses: z.array(
    z.object({
      startedAt: z.string().nullable(),
      submittedAt: z.string().nullable(),
      lateSubmissionStatus: z.enum(['pending', 'accepted', 'rejected']).nullable(),
    }),
  ),
});

export function assessmentCompletionReadiness(source: unknown, sessionId: string) {
  const parsed = resultsSchema.safeParse(source);
  if (!parsed.success || parsed.data.session.id !== sessionId) return null;
  const data = parsed.data;
  let started = 0;
  let inProgress = 0;
  let rejectedLate = 0;
  for (const response of data.responses) {
    if (response.lateSubmissionStatus === 'rejected') rejectedLate++;
    if (response.startedAt === null) continue;
    started++;
    if (response.submittedAt === null && response.lateSubmissionStatus === null) inProgress++;
  }
  return {
    total: data.classStudentCount,
    notStarted: Math.max(0, data.classStudentCount - started),
    inProgress,
    submitted: data.submitted,
    pendingManual: data.pendingManualCount,
    pendingLate: data.pendingLateReviewCount,
    rejectedLate,
  };
}
