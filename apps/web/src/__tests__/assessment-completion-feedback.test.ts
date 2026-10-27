import {
  assessmentCompletionLabel,
  assessmentCompletionMessage,
} from '../app/dashboard/akademik/_components/assessment-completion-feedback';

describe('assessment completion feedback follows the authoritative grade outcome', () => {
  const base = { type: 'formatif', gradeTarget: 'uh' };
  const summary = { gradedCount: 0, pendingManualCount: 0, skippedCount: 0, gradeTarget: 'uh' };

  it('does not claim a sync for unanswered or pending-only sessions', () => {
    expect(assessmentCompletionMessage({ ...base, gradingSummary: summary })).toBe(
      'Sesi selesai. Belum ada nilai final untuk disimpan.',
    );
    expect(
      assessmentCompletionMessage({
        ...base,
        gradingSummary: { ...summary, pendingManualCount: 1 },
      }),
    ).toBe('Sesi selesai. 1 jawaban menunggu koreksi.');
  });
  it('states saved and pending separately; a legitimate zero still counts as a saved Grade', () => {
    expect(
      assessmentCompletionMessage({
        ...base,
        gradingSummary: { ...summary, gradedCount: 3, pendingManualCount: 2 },
      }),
    ).toBe('Sesi selesai. 3 nilai tersimpan di Gradebook. 2 jawaban menunggu koreksi.');
    expect(
      assessmentCompletionMessage({ ...base, gradingSummary: { ...summary, gradedCount: 1 } }),
    ).toBe('Sesi selesai. 1 nilai tersimpan di Gradebook.');
  });
  it('does not promise a Grade for diagnostic, untargeted or remedial completion', () => {
    for (const session of [
      { type: 'diagnostik', gradeTarget: null },
      { ...base, gradingSummary: { ...summary, gradeTarget: null } },
    ]) {
      expect(assessmentCompletionMessage(session)).toBe(
        'Sesi selesai. Asesmen ini tidak masuk Gradebook.',
      );
    }
    expect(assessmentCompletionMessage({ ...base, purpose: 'remedial' })).toContain(
      'Tinjau hasil peserta',
    );
  });
  it('uses honest fallback copy when an older API omits the summary', () => {
    expect(assessmentCompletionMessage(base)).toBe(
      'Sesi selesai. Periksa Gradebook untuk melihat nilai terbaru.',
    );
    expect(assessmentCompletionMessage(undefined)).not.toContain('disinkronkan');
  });
  it('keeps completion action labels consistent with the session target', () => {
    expect(assessmentCompletionLabel(base)).toBe('Selesaikan dan sinkron Gradebook');
    for (const session of [
      { type: 'diagnostik' },
      { type: 'formatif', gradeTarget: null },
      { type: 'formatif', purpose: 'remedial' as const },
    ]) {
      expect(assessmentCompletionLabel(session)).toBe('Selesaikan sesi');
    }
  });
});
