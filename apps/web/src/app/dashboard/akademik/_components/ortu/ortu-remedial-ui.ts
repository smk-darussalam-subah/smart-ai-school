export interface FamilyRemedialParticipant {
  status: 'assigned' | 'in_progress' | 'submitted' | 'passed' | 'needs_retry';
  attemptNumber: number;
  outcome: 'pending' | 'submitted' | 'passed' | 'needs_retry';
}

export interface FamilyRemedialItem {
  title: string;
  type: string;
  status: 'active' | 'completed';
  subject: string | null;
  dueAt: string | null;
  academicYear: string;
  semester: number;
  participant: FamilyRemedialParticipant | null;
}

export interface FamilyRemedialListResponse {
  data?: FamilyRemedialItem[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface FamilyRemedialCardEntry {
  key: string;
  item: FamilyRemedialItem;
}

export function shouldApplyOrtuRemedialResponse(input: {
  requestId: number;
  currentRequestId: number;
  studentId: string;
  currentStudentId?: string;
  aborted?: boolean;
  mounted?: boolean;
}): boolean {
  return input.mounted !== false
    && !input.aborted
    && input.requestId === input.currentRequestId
    && input.studentId === input.currentStudentId;
}

export function remedialDueState(dueAt: string | null, now = new Date()): 'none' | 'due' | 'overdue' {
  if (!dueAt) return 'none';
  return new Date(dueAt).getTime() < now.getTime() ? 'overdue' : 'due';
}

function keySegment(value: string | number | null | undefined): string {
  return encodeURIComponent(String(value ?? 'none'));
}

export function familyRemedialPublicIdentity(item: FamilyRemedialItem): string {
  const participant = item.participant;
  return [
    item.academicYear,
    item.semester,
    item.type,
    item.status,
    item.subject,
    item.title,
    item.dueAt,
    participant?.status,
    participant?.attemptNumber,
    participant?.outcome,
  ].map(keySegment).join('|');
}

export function buildFamilyRemedialCardEntries(items: FamilyRemedialItem[]): FamilyRemedialCardEntry[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const identity = familyRemedialPublicIdentity(item);
    const occurrence = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, occurrence);
    return {
      key: `${identity}|occ:${occurrence}`,
      item,
    };
  });
}
