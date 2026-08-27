import type { Session } from 'next-auth';
import { apiFetchResult } from '@/lib/api';
import { getActiveViewAs, getEffectiveRoles } from '@/lib/view-as';
import type { HelpAuthoritySnapshot, HelpTopicSummary } from './help-projection';
import { projectHelpSummaries } from './help-projection';

interface MeResponse {
  permissions: string[];
}

interface PositionsResponse {
  positions: Array<{
    status: 'ACTIVE';
    position: { code: string; name: string };
    major?: { id: string; code: string; name: string } | null;
  }>;
}

interface AssignmentResponse {
  activeAssignmentCount: number;
}

interface WaliResponse {
  isWaliKelas: boolean;
  classes: Array<{ id: string }>;
}

interface ChildrenResponse {
  data: Array<{ id: string }>;
}

export interface HelpAuthorityResult {
  authority: HelpAuthoritySnapshot;
  topics: HelpTopicSummary[];
  warning: string | null;
}

export function parentHelpContextWarning(
  isParent: boolean,
  childrenAvailable: boolean,
  childCount: number,
  selectedChildVerified: boolean,
): string | null {
  if (!isParent || !childrenAvailable || childCount <= 1 || selectedChildVerified) return null;
  return 'Pilih anak terlebih dahulu agar panduan keluarga tampil untuk konteks yang benar.';
}

export async function resolveHelpAuthority(
  session: Session,
  selectedChildId?: string | null,
): Promise<HelpAuthorityResult> {
  const token = session.accessToken ?? '';
  const [identityRoles, viewAs, meResult, positionResult] = await Promise.all([
    getEffectiveRoles(session),
    getActiveViewAs(session),
    apiFetchResult<MeResponse>('/auth/me', token),
    apiFetchResult<PositionsResponse>('/positions/my-positions', token),
  ]);

  const permissionCheckAvailable = meResult.status === 'success';
  const permissions = permissionCheckAvailable ? meResult.data.permissions : [];
  const positionCodes = viewAs || positionResult.status !== 'success'
    ? []
    : positionResult.data.positions.map((item) => item.position.code);

  const isTeacher = identityRoles.includes('GURU');
  const isParent = identityRoles.includes('ORANG_TUA');
  const [assignmentResult, waliResult, childrenResult] = await Promise.all([
    isTeacher
      ? apiFetchResult<AssignmentResponse>('/teaching-assignments/me/context', token)
      : Promise.resolve(null),
    isTeacher
      ? apiFetchResult<WaliResponse>('/teachers/me/wali-classes', token)
      : Promise.resolve(null),
    isParent
      ? apiFetchResult<ChildrenResponse>('/students/my-children', token)
      : Promise.resolve(null),
  ]);

  const contexts: HelpAuthoritySnapshot['contexts'] = [];
  if (assignmentResult?.status === 'success' && assignmentResult.data.activeAssignmentCount > 0) {
    contexts.push('teaching-assignment');
  }
  if (waliResult?.status === 'success' && waliResult.data.isWaliKelas) {
    contexts.push('wali-kelas');
  }
  if (positionCodes.includes('KAPROG') && positionResult.status === 'success' &&
    positionResult.data.positions.some((item) => item.position.code === 'KAPROG' && item.major)) {
    contexts.push('kaprog-major');
  }

  const childIds = childrenResult?.status === 'success'
    ? childrenResult.data.data.map((child) => child.id)
    : [];
  const selectedChildVerified = selectedChildId
    ? childIds.includes(selectedChildId)
    : childIds.length === 1;
  if (selectedChildVerified) contexts.push('selected-child');
  if (childIds.length > 1) contexts.push('multi-child');

  const authority: HelpAuthoritySnapshot = {
    identityRoles,
    positionCodes,
    permissions,
    contexts,
    viewAs,
    permissionCheckAvailable,
    selectedChildVerified,
    childCount: childIds.length,
  };

  const warnings: string[] = [];
  if (!permissionCheckAvailable) warnings.push('Izin fitur belum dapat diverifikasi. Panduan terbatas ditampilkan.');
  if (positionResult.status !== 'success' && !viewAs) warnings.push('Appointment aktif belum dapat diverifikasi.');
  if (isParent && childrenResult?.status !== 'success') warnings.push('Konteks anak belum dapat diverifikasi.');
  const parentContextWarning = parentHelpContextWarning(
    isParent,
    childrenResult?.status === 'success',
    childIds.length,
    selectedChildVerified,
  );
  if (parentContextWarning) warnings.push(parentContextWarning);

  return {
    authority,
    topics: projectHelpSummaries(authority),
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}
