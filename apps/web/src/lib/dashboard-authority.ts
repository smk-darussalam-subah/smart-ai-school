import type { Session } from 'next-auth';
import { apiFetch } from '@/lib/api';
import { getActiveViewAs, getEffectiveRoles } from '@/lib/view-as';

interface MyPositionsResponse {
  positions: Array<{ status: 'ACTIVE'; position: { code: string; name: string } }>;
}

interface MeResponse {
  permissions: string[];
}

export interface DashboardAuthority {
  roles: string[];
  permissions: string[];
  permissionCheckAvailable: boolean;
  hasRole: (...roles: string[]) => boolean;
  can: (permission: string) => boolean;
}

/**
 * Resolve route authority from stable identity, active Appointment positions,
 * and current DB permissions. Mutation controls fail closed if /auth/me fails.
 */
export async function resolveDashboardAuthority(session: Session): Promise<DashboardAuthority> {
  const token = session.accessToken ?? '';
  const [identityRoles, viewAs, positions, me] = await Promise.all([
    getEffectiveRoles(session),
    getActiveViewAs(session),
    apiFetch<MyPositionsResponse>('/positions/my-positions', token),
    apiFetch<MeResponse>('/auth/me', token),
  ]);
  const positionRoles = viewAs
    ? []
    : (positions?.positions ?? []).map((item) => item.position.code);
  const roles = [...new Set([...identityRoles, ...positionRoles])];
  const permissions = me?.permissions ?? [];

  return {
    roles,
    permissions,
    permissionCheckAvailable: me !== null,
    hasRole: (...expected) => expected.some((role) => roles.includes(role)),
    can: (permission) => me !== null &&
      (permissions.includes('*') || permissions.includes(permission)),
  };
}
