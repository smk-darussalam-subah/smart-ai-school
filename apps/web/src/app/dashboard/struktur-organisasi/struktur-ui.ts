export type StructureAppointmentStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED';

export const STRUCTURE_APPOINTMENT_STATUS_LABELS: Record<StructureAppointmentStatus, string> = {
  PENDING_APPROVAL: 'Menunggu approval',
  APPROVED: 'Disetujui',
  ACTIVE: 'Aktif',
  SUSPENDED: 'Cuti/PLT',
};

export function appointmentStatusLabel(
  status: StructureAppointmentStatus,
  isEffectiveNow = false,
) {
  return isEffectiveNow ? 'Efektif' : STRUCTURE_APPOINTMENT_STATUS_LABELS[status];
}

export function formatAppointmentDate(value: string | null) {
  if (!value) return 'tanpa batas';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}
