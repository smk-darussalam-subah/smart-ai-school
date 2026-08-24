import { buildLegacyAuthRedirect } from '../app/auth/auth-redirect';
import { resolveLoginNotice, safeLoginCallback } from '../app/login/login-ui';
import { identityRoleLabel, isShellRouteActive, positionRoleLabel } from '../lib/display-shell';
import { isPublicPath } from '../middleware';

describe('Wave 8.5 canonical auth and shell contract', () => {
  it('accepts only a local callback path', () => {
    expect(safeLoginCallback('/dashboard/monitoring?status=MISSED#queue')).toBe(
      '/dashboard/monitoring?status=MISSED#queue',
    );
    expect(safeLoginCallback('https://evil.example/dashboard')).toBe('/dashboard');
    expect(safeLoginCallback('//evil.example')).toBe('/dashboard');
    expect(safeLoginCallback('/%5cevil.example')).toBe('/dashboard');
    expect(safeLoginCallback('/%')).toBe('/dashboard');
  });

  it('keeps the legacy auth route as a bounded redirect to canonical login', () => {
    expect(buildLegacyAuthRedirect({ callbackUrl: '/dashboard/jadwal', reason: 'session' })).toBe(
      '/login?callbackUrl=%2Fdashboard%2Fjadwal&reason=session',
    );
    expect(buildLegacyAuthRedirect({ callbackUrl: 'https://evil.example', reason: 'other' })).toBe(
      '/login?callbackUrl=%2Fdashboard',
    );
  });

  it('returns actionable session and OAuth notices', () => {
    expect(resolveLoginNotice('session', null)?.tone).toBe('warning');
    expect(resolveLoginNotice(null, 'AccessDenied')?.message).toContain('ditolak');
    expect(resolveLoginNotice(null, 'unknown')?.tone).toBe('error');
  });

  it('separates stable identity labels from Appointment labels', () => {
    expect(identityRoleLabel('GURU')).toBe('Guru');
    expect(identityRoleLabel('KEPALA_SEKOLAH')).toBe('Pengguna sekolah');
    expect(positionRoleLabel('KEPALA_SEKOLAH')).toBe('Kepala Sekolah');
    expect(positionRoleLabel('WAKA_KURIKULUM')).toBe('Waka Kurikulum');
  });

  it('marks only the exact route or its child as active', () => {
    expect(isShellRouteActive('/dashboard/monitoring', '/dashboard/monitoring')).toBe(true);
    expect(isShellRouteActive('/dashboard/monitoring/device', '/dashboard/monitoring')).toBe(true);
    expect(isShellRouteActive('/dashboard/monitoring-old', '/dashboard/monitoring')).toBe(false);
    expect(isShellRouteActive('/dashboard/akademik', '/dashboard')).toBe(false);
  });

  it('keeps branding assets and the paired display boundary public', () => {
    expect(isPublicPath('/icon-192.png')).toBe(true);
    expect(isPublicPath('/icon-512.png')).toBe(true);
    expect(isPublicPath('/favicon.ico')).toBe(true);
    expect(isPublicPath('/apple-touch-icon.png')).toBe(true);
    expect(isPublicPath('/display/pair')).toBe(true);
    expect(isPublicPath('/display/room')).toBe(true);
    expect(isPublicPath('/api/display/activate')).toBe(true);
    expect(isPublicPath('/dashboard/monitoring')).toBe(false);
    expect(statSync(resolve(__dirname, '../../public/favicon.ico')).size).toBeGreaterThan(100);
    expect(statSync(resolve(__dirname, '../../public/apple-touch-icon.png')).size).toBeGreaterThan(
      100,
    );
  });
});
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
