import { can } from './permissions';

export interface NavigationAuthorityRule {
  roles?: string[];
  permissions?: string[];
}

export const PPDB_DISCOVERABILITY_RULE = {
  roles: [
    'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'KEPALA_TU',
    'WAKA_HUMAS', 'KOOR_BKK', 'KOOR_HUBIN', 'WAKIL_KOOR_HUBIN',
  ],
  permissions: ['ppdb.read'],
} satisfies Required<NavigationAuthorityRule>;

export const CLASS_CONFIG_DISCOVERABILITY_RULE = {
  roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'WAKA_KURIKULUM', 'KAPROG'],
  permissions: ['academic.teaching.read'],
} satisfies Required<NavigationAuthorityRule>;

export function isNavigationItemVisible(
  item: NavigationAuthorityRule,
  effectiveRoles: string[],
  permissions: string[],
  permissionCheckFailed: boolean,
): boolean {
  const isSuperAdmin = effectiveRoles.includes('SUPER_ADMIN');
  if (item.roles && !item.roles.some((role) => effectiveRoles.includes(role))) return false;
  if (
    item.permissions &&
    !isSuperAdmin &&
    (permissionCheckFailed || !can(permissions, item.permissions))
  ) return false;
  return true;
}
