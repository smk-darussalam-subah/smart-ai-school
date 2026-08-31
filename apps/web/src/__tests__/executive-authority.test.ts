import { canAccessExecutiveDashboard } from '@/app/dashboard/executive/executive-authority';

function authority(roles: string[], permissions: string[]) {
  return {
    hasRole: (...expected: string[]) => expected.some((role) => roles.includes(role)),
    can: (permission: string) => permissions.includes('*') || permissions.includes(permission),
  };
}

describe('executive dashboard authority', () => {
  it('accepts Super Admin through the existing wildcard permission', () => {
    expect(canAccessExecutiveDashboard(authority(['SUPER_ADMIN'], ['*']))).toBe(true);
  });

  it('accepts a stable Guru only when an active Kepala Sekolah Appointment is present', () => {
    expect(canAccessExecutiveDashboard(authority(['GURU', 'KEPALA_SEKOLAH'], ['finance.read'])))
      .toBe(true);
    expect(canAccessExecutiveDashboard(authority(['GURU'], ['finance.read']))).toBe(false);
  });

  it('fails closed when the effective permission projection is unavailable', () => {
    expect(canAccessExecutiveDashboard(authority(['KEPALA_SEKOLAH'], []))).toBe(false);
  });

  it('does not grant other Appointment holders an executive route', () => {
    expect(canAccessExecutiveDashboard(authority(['GURU', 'WAKA_KURIKULUM'], ['finance.read'])))
      .toBe(false);
  });
});
