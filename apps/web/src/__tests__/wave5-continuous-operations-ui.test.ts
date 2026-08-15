import { normalizeInitialQuestion, setupAiChatMountedGuard, shouldApplyAiChatResponse, shouldSendChatKey } from '../app/dashboard/ai/ai-chat-ui';
import {
  buildFamilyRemedialCardEntries,
  familyRemedialPublicIdentity,
  remedialDueState,
  shouldApplyOrtuRemedialResponse,
  type FamilyRemedialItem,
} from '../app/dashboard/akademik/_components/ortu/ortu-remedial-ui';
import { buildFinanceSppQuery, canApproveSpp, canRecordSpp, defaultSppPeriod, FinanceAuthority } from '../app/dashboard/keuangan/keuangan-ui';
import { getAnnouncementDisplayStatus } from '../app/dashboard/pengumuman/pengumuman-ui';

function authority(permissions: string[], roles: string[]): FinanceAuthority {
  return {
    can: (permission: string) => permissions.includes(permission),
    hasRole: (...allowed: string[]) => roles.some((role) => allowed.includes(role)),
  };
}

describe('Wave 5 continuous operations UI helpers', () => {
  it('normalizes AI chat prefill from search params without restoring stale sessions', () => {
    expect(normalizeInitialQuestion('  apa jadwal hari ini?  ')).toBe('apa jadwal hari ini?');
    expect(normalizeInitialQuestion(['pertama', 'kedua'])).toBe('pertama');
    expect(normalizeInitialQuestion(undefined)).toBe('');
    expect(normalizeInitialQuestion('x'.repeat(600))).toHaveLength(500);
  });

  it('keeps Enter as send and Shift+Enter/composition as multiline input', () => {
    expect(shouldSendChatKey({ key: 'Enter' })).toBe(true);
    expect(shouldSendChatKey({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSendChatKey({ key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSendChatKey({ key: 'Tab' })).toBe(false);
  });

  it('blocks stale AI chat responses after session switch, delete, or abort', () => {
    expect(shouldApplyAiChatResponse({ requestEpoch: 3, currentEpoch: 3 })).toBe(true);
    expect(shouldApplyAiChatResponse({ requestEpoch: 3, currentEpoch: 4 })).toBe(false);
    expect(shouldApplyAiChatResponse({ requestEpoch: 3, currentEpoch: 3, aborted: true })).toBe(false);
    expect(shouldApplyAiChatResponse({ requestEpoch: 3, currentEpoch: 3, mounted: false })).toBe(false);
  });

  it('resets AI chat mounted guard during Strict Mode effect replay', () => {
    const ref = { current: false };
    const cleanup = jest.fn();
    const firstCleanup = setupAiChatMountedGuard(ref, cleanup);
    expect(ref.current).toBe(true);
    firstCleanup();
    expect(ref.current).toBe(false);
    const secondCleanup = setupAiChatMountedGuard(ref, cleanup);
    expect(ref.current).toBe(true);
    secondCleanup();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('blocks stale parent remedial responses when selected child changes', () => {
    expect(shouldApplyOrtuRemedialResponse({
      requestId: 2,
      currentRequestId: 2,
      studentId: 'child-a',
      currentStudentId: 'child-a',
    })).toBe(true);
    expect(shouldApplyOrtuRemedialResponse({
      requestId: 1,
      currentRequestId: 2,
      studentId: 'child-a',
      currentStudentId: 'child-b',
    })).toBe(false);
    expect(shouldApplyOrtuRemedialResponse({
      requestId: 2,
      currentRequestId: 2,
      studentId: 'child-a',
      currentStudentId: 'child-a',
      aborted: true,
    })).toBe(false);
    expect(remedialDueState('2026-08-14T00:00:00.000Z', new Date('2026-08-15T00:00:00.000Z'))).toBe('overdue');
  });

  it('builds unique remedial card keys from the privacy-safe public projection', () => {
    const item: FamilyRemedialItem = {
      title: 'Remedial Subnetting',
      type: 'remedial',
      status: 'active',
      subject: 'TJKT',
      dueAt: '2026-08-20T00:00:00.000Z',
      academicYear: '2026/2027',
      semester: 1,
      participant: {
        status: 'assigned',
        attemptNumber: 1,
        outcome: 'pending',
      },
    };
    const sibling = {
      ...item,
      participant: { ...item.participant!, attemptNumber: 2 },
    };

    expect(familyRemedialPublicIdentity(item)).not.toContain('participant');
    expect(familyRemedialPublicIdentity(item)).not.toContain('grade');
    expect(familyRemedialPublicIdentity(item)).not.toBe(familyRemedialPublicIdentity(sibling));

    const entries = buildFamilyRemedialCardEntries([item, item, sibling]);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(3);
    expect(entries.map((entry) => entry.key)).toEqual([
      `${familyRemedialPublicIdentity(item)}|occ:1`,
      `${familyRemedialPublicIdentity(item)}|occ:2`,
      `${familyRemedialPublicIdentity(sibling)}|occ:1`,
    ]);
  });

  it('uses effective finance authority instead of broad stable roles', () => {
    expect(canRecordSpp(authority(['finance.create'], ['TATA_USAHA']))).toBe(true);
    expect(canRecordSpp(authority(['finance.record'], ['TATA_USAHA']))).toBe(false);
    expect(canRecordSpp(authority(['finance.create'], ['GURU']))).toBe(false);
    expect(canApproveSpp(authority(['finance.approve'], ['KEPALA_SEKOLAH']))).toBe(true);
    expect(canApproveSpp(authority(['finance.approve'], ['BENDAHARA']))).toBe(false);
  });

  it('builds SPP query with server-side class filtering', () => {
    const qs = buildFinanceSppQuery({
      page: 2,
      limit: 10,
      search: ' Kang Abdul ',
      status: 'paid',
      month: '8',
      year: '2026',
      classId: '8b54df3a-44d1-4fe4-bc7c-95b9180a2d46',
    });

    expect(qs.get('search')).toBe('Kang Abdul');
    expect(qs.get('classId')).toBe('8b54df3a-44d1-4fe4-bc7c-95b9180a2d46');
    expect(qs.get('status')).toBe('paid');
  });

  it('defaults SPP period from current date, not a hardcoded historical month', () => {
    expect(defaultSppPeriod(new Date('2026-08-14T00:00:00.000Z'))).toEqual({ month: 8, year: 2026 });
  });

  it('labels scheduled announcements truthfully before delivery preparation', () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    expect(getAnnouncementDisplayStatus({
      status: 'published',
      scheduledAt: '2026-08-15T00:00:00.000Z',
      deliveryPreparedAt: null,
    }, now)).toEqual({ label: 'Terjadwal', variant: 'outline' });

    expect(getAnnouncementDisplayStatus({
      status: 'published',
      scheduledAt: '2026-08-15T00:00:00.000Z',
      deliveryPreparedAt: '2026-08-14T01:00:00.000Z',
    }, now)).toEqual({ label: 'Terbit', variant: 'default' });
  });
});
