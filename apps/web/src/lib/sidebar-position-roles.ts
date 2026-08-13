export function visiblePositionRoles(
  viewAs: string | null,
  identityRoles: string[],
  positionRoles: string[],
): string[] {
  if (viewAs) return [];
  return positionRoles.filter((role) => !identityRoles.includes(role));
}
