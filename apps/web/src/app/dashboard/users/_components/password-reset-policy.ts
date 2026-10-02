const TATA_USAHA_RESETTABLE_ROLES = new Set(['GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI']);

export function canOfferPasswordReset(input: {
  canResetPasswords: boolean;
  isSuperAdmin: boolean;
  targetRole: string;
  targetIsActive: boolean;
  targetIsArchived: boolean;
}): boolean {
  if (!input.canResetPasswords || !input.targetIsActive || input.targetIsArchived) return false;
  if (input.targetRole === 'SUPER_ADMIN') return false;
  return input.isSuperAdmin || TATA_USAHA_RESETTABLE_ROLES.has(input.targetRole);
}

export function canDismissPasswordReset(inFlight: boolean): boolean {
  return !inFlight;
}
