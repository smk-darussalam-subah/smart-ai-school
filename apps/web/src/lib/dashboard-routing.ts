const MOBILE_ONLY_DASHBOARD_ROLES = ['SISWA', 'ORANG_TUA'] as const;

/**
 * Learner dashboards use the self-contained akademik workspace. A staff or
 * teacher role always takes precedence when an account has more than one role.
 */
export function isMobileOnlyDashboardRoleSet(roles: readonly string[]): boolean {
  const isLearner = MOBILE_ONLY_DASHBOARD_ROLES.some((role) => roles.includes(role));
  const learnerOnly = roles.every((role) => MOBILE_ONLY_DASHBOARD_ROLES.includes(role as (typeof MOBILE_ONLY_DASHBOARD_ROLES)[number]));

  return isLearner && learnerOnly;
}
