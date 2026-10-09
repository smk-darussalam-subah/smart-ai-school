/** Date-column validity, inclusive through the approved school date (WIB). */
export function isScheduleOperational(
  group: { mode: string; expiresOn: Date | null } | null | undefined,
  serviceDate: string,
): boolean {
  if (!group) return true;
  if (group.mode === 'AUTHORIZED_EXCEPTION' && !group.expiresOn) return false;
  return !group.expiresOn || group.expiresOn.toISOString().slice(0, 10) >= serviceDate;
}
