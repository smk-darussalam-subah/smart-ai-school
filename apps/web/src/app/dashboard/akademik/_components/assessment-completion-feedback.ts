import type { AssessmentSessionData } from '../actions';

type Completion = Pick<
  AssessmentSessionData,
  'purpose' | 'type' | 'gradeTarget' | 'gradingSummary'
>;

export function assessmentCompletionLabel(session: Completion | null): string {
  return session?.purpose === 'remedial' ||
    session?.type === 'diagnostik' ||
    session?.gradeTarget === null
    ? 'Selesaikan sesi'
    : 'Selesaikan dan sinkron Gradebook';
}

/** A finished session is not proof that every answer has a final Grade. */
export function assessmentCompletionMessage(session: Completion | undefined): string {
  if (session?.purpose === 'remedial')
    return 'Sesi remedial selesai. Tinjau hasil peserta untuk menetapkan nilai.';
  const summary = session?.gradingSummary;
  if (
    session?.type === 'diagnostik' ||
    session?.gradeTarget === null ||
    summary?.gradeTarget === null
  ) {
    return 'Sesi selesai. Asesmen ini tidak masuk Gradebook.';
  }
  if (!summary) return 'Sesi selesai. Periksa Gradebook untuk melihat nilai terbaru.';
  const saved =
    summary.gradedCount > 0 ? `${summary.gradedCount} nilai tersimpan di Gradebook.` : '';
  const pending =
    summary.pendingManualCount > 0 ? `${summary.pendingManualCount} jawaban menunggu koreksi.` : '';
  if (!saved && !pending) return 'Sesi selesai. Belum ada nilai final untuk disimpan.';
  return ['Sesi selesai.', saved, pending].filter(Boolean).join(' ');
}
