import {
  RAPOR_LEARNER_COLORS,
  contrastRatio,
  initialChildIndex,
  kktpProvenanceLabel,
  learnerDashboardHref,
  learnerNotificationCenterHref,
  learnerReportHref,
  restoreDialogTriggerFocus,
} from '@/app/dashboard/akademik/_components/learner-navigation';

describe('learner notification and report navigation', () => {
  it('keeps dashboard and notification-center destinations distinct', () => {
    expect(learnerDashboardHref()).toBe('/dashboard/akademik');
    expect(learnerNotificationCenterHref()).toBe('/dashboard/akademik?panel=notifications');
  });

  it('preserves the selected child across parent dashboard, notification, and report routes', () => {
    const studentId = 'child id/with spaces';

    expect(learnerDashboardHref(studentId)).toBe('/dashboard/akademik?studentId=child%20id%2Fwith%20spaces');
    expect(learnerNotificationCenterHref(studentId)).toBe('/dashboard/akademik?panel=notifications&studentId=child%20id%2Fwith%20spaces');
    expect(learnerReportHref(studentId)).toBe('/dashboard/rapor?studentId=child%20id%2Fwith%20spaces');
  });

  it('selects only the requested owned child and safely falls back when it is absent', () => {
    const children = [{ studentId: 'child-a' }, { studentId: 'child-b' }];

    expect(initialChildIndex(children, 'child-b')).toBe(1);
    expect(initialChildIndex(children, 'forged-child')).toBe(0);
    expect(initialChildIndex([], 'child-b')).toBe(0);
  });

  it('maps internal KKTP provenance to learner-facing Indonesian copy', () => {
    expect(kktpProvenanceLabel('system_default')).toBe('Standar sekolah');
    expect(kktpProvenanceLabel('config')).toBe('Konfigurasi kelas');
    expect(kktpProvenanceLabel('module')).toBe('Ketentuan modul');
    expect(kktpProvenanceLabel('unknown')).toBe('Snapshot resmi');
  });

  it('keeps Rapor call-to-action and passive navigation colors above WCAG AA', () => {
    expect(contrastRatio(RAPOR_LEARNER_COLORS.ctaForeground, RAPOR_LEARNER_COLORS.ctaBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(RAPOR_LEARNER_COLORS.darkNavInactive, RAPOR_LEARNER_COLORS.darkNavBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(RAPOR_LEARNER_COLORS.darkParentNavInactive, RAPOR_LEARNER_COLORS.darkNavBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(RAPOR_LEARNER_COLORS.lightNavInactive, RAPOR_LEARNER_COLORS.lightNavBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('restores focus to the notification trigger when the modal closes', () => {
    const focus = jest.fn();

    restoreDialogTriggerFocus({ focus });
    restoreDialogTriggerFocus(null);

    expect(focus).toHaveBeenCalledTimes(1);
  });
});
