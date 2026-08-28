import type {
  HelpArtifact,
  HelpContext,
  HelpDeck,
  HelpPositionCode,
  HelpPrimaryRole,
  HelpScreenshot,
} from './help-schema';

export interface HelpAuthoritySnapshot {
  identityRoles: string[];
  positionCodes: string[];
  permissions: string[];
  contexts: HelpContext[];
  viewAs: string | null;
  permissionCheckAvailable: boolean;
  selectedChildVerified: boolean;
  childCount: number;
}

export type HelpEvidenceAuthorityContract = Pick<
  HelpArtifact | HelpDeck | HelpScreenshot,
  | 'primaryRoles'
  | 'positionCodes'
  | 'assignmentContexts'
  | 'permissionsAny'
  | 'permissionsAll'
  | 'selectedChildRequired'
  | 'allowSuperAdminRecovery'
>;

const POSITION_STABLE_ROLE: Record<HelpPositionCode, HelpPrimaryRole> = {
  KEPALA_SEKOLAH: 'GURU',
  WAKA_KURIKULUM: 'GURU',
  WAKA_KESISWAAN: 'GURU',
  WAKA_HUMAS: 'GURU',
  WAKA_SARPRAS: 'GURU',
  KEPALA_TU: 'TATA_USAHA',
  KAPROG: 'GURU',
  KOOR_BKK: 'GURU',
  KOOR_HUBIN: 'GURU',
  WAKIL_KOOR_BKK: 'GURU',
  WAKIL_KOOR_HUBIN: 'GURU',
  GURU_BK: 'GURU',
  BENDAHARA: 'TATA_USAHA',
  STAF_KEPEGAWAIAN: 'TATA_USAHA',
  OPERATOR_DAPODIK: 'TATA_USAHA',
};

function intersects(left: string[], right: string[]): boolean {
  return left.some((value) => right.includes(value));
}

export function canAccessHelpEvidenceAuthority(
  evidence: HelpEvidenceAuthorityContract,
  authority: HelpAuthoritySnapshot,
): boolean {
  const isSuperAdmin = authority.identityRoles.includes('SUPER_ADMIN') && !authority.viewAs;
  if (isSuperAdmin && evidence.allowSuperAdminRecovery) return true;

  const audienceRestricted = evidence.primaryRoles.length > 0 || evidence.positionCodes.length > 0;
  const audienceMatch = !audienceRestricted ||
    intersects(evidence.primaryRoles, authority.identityRoles) ||
    intersects(evidence.positionCodes, authority.positionCodes);
  if (!audienceMatch) return false;
  if (evidence.selectedChildRequired && !authority.selectedChildVerified) return false;
  if (!evidence.assignmentContexts.every((context) => authority.contexts.includes(context))) return false;

  if (evidence.permissionsAny.length > 0) {
    if (!authority.permissionCheckAvailable) return false;
    if (!authority.permissions.includes('*') && !intersects(evidence.permissionsAny, authority.permissions)) return false;
  }
  if (evidence.permissionsAll.length > 0) {
    if (!authority.permissionCheckAvailable) return false;
    if (!authority.permissions.includes('*') &&
      !evidence.permissionsAll.every((permission) => authority.permissions.includes(permission))) return false;
  }
  return true;
}

function minimalConsumerAuthorities(contract: HelpEvidenceAuthorityContract): HelpAuthoritySnapshot[] {
  const audiences: Array<{ identityRoles: string[]; positionCodes: string[] }> = [
    ...contract.primaryRoles.map((role) => ({ identityRoles: [role], positionCodes: [] })),
    ...contract.positionCodes.map((position) => ({
      identityRoles: [POSITION_STABLE_ROLE[position]],
      positionCodes: [position],
    })),
  ];
  if (audiences.length === 0) audiences.push({ identityRoles: [], positionCodes: [] });

  const permissionAlternatives = contract.permissionsAny.length > 0 ? contract.permissionsAny : [null];
  const scenarios = audiences.flatMap((audience) => permissionAlternatives.map((permission) => ({
    ...audience,
    permissions: [...contract.permissionsAll, ...(permission ? [permission] : [])],
    contexts: [...contract.assignmentContexts],
    viewAs: null,
    permissionCheckAvailable: true,
    selectedChildVerified: contract.selectedChildRequired,
    childCount: contract.selectedChildRequired ? 1 : 0,
  })));
  if (contract.allowSuperAdminRecovery) {
    scenarios.push({
      identityRoles: ['SUPER_ADMIN'], positionCodes: [], permissions: ['*'], contexts: [],
      viewAs: null, permissionCheckAvailable: true, selectedChildVerified: false, childCount: 0,
    });
  }
  return scenarios;
}

export function isHelpEvidenceConsumerCompatible(
  screenshot: HelpScreenshot,
  consumer: HelpArtifact | HelpDeck,
): boolean {
  return minimalConsumerAuthorities(consumer)
    .every((authority) => canAccessHelpEvidenceAuthority(screenshot, authority));
}
