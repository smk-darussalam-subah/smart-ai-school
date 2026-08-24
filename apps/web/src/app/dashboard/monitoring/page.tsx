import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetchResult } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import MonitoringClient from './MonitoringClient';
import {
  hasMonitoringReaderRole,
  normalizeMonitoringDevices,
  normalizeMonitoringSnapshot,
} from '@/components/monitoring/monitoring-contract';

export default async function MonitoringPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=%2Fdashboard%2Fmonitoring');
  const authority = await resolveDashboardAuthority(session);
  const identityOrAppointmentAllowed = hasMonitoringReaderRole(authority.roles);
  const canRead = identityOrAppointmentAllowed
    && authority.can('operational.monitoring.read');

  if (!authority.permissionCheckAvailable) {
    return <MonitoringClient initialSnapshot={null} initialDevices={[]} initialError="Izin monitoring belum dapat diverifikasi. Muat ulang setelah koneksi pulih." canManageDevices={false} />;
  }
  if (!canRead) {
    return <MonitoringClient initialSnapshot={null} initialDevices={[]} initialError="Akun ini tidak memiliki kewenangan monitoring operasional." forbidden canManageDevices={false} />;
  }

  const token = session.accessToken ?? '';
  const canManageDevices = authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH')
    && authority.can('operational.display.manage');
  const [monitoringResult, deviceResult] = await Promise.all([
    apiFetchResult<unknown>('/operational-monitoring/snapshot', token),
    apiFetchResult<unknown>('/display-devices', token),
  ]);
  const snapshot = monitoringResult.status === 'success' ? normalizeMonitoringSnapshot(monitoringResult.data) : null;
  const devices = deviceResult.status === 'success' ? normalizeMonitoringDevices(deviceResult.data) : [];
  const initialError = monitoringResult.status === 'success'
    ? snapshot ? null : 'Respons monitoring tidak sesuai kontrak.'
    : monitoringResult.message;
  const deviceWarning = deviceResult.status === 'success' ? null : deviceResult.message;

  return (
    <MonitoringClient
      initialSnapshot={snapshot}
      initialDevices={devices}
      initialError={initialError}
      deviceWarning={deviceWarning}
      canManageDevices={canManageDevices}
    />
  );
}
