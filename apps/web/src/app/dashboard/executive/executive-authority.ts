import type { DashboardAuthority } from '@/lib/dashboard-authority';

type ExecutiveAuthority = Pick<DashboardAuthority, 'hasRole' | 'can'>;

export function canAccessExecutiveDashboard(authority: ExecutiveAuthority): boolean {
  return authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH') && authority.can('finance.read');
}
