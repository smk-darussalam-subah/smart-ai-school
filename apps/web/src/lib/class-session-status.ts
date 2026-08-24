const STATUS_META: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: 'Dijadwalkan', className: 'bg-slate-100 text-slate-700' },
  REASSIGNED: { label: 'Guru pengganti', className: 'bg-sky-100 text-sky-800' },
  STARTED: { label: 'Berlangsung', className: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Selesai', className: 'bg-emerald-100 text-emerald-800' },
  MISSED: { label: 'Tidak dimulai', className: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Dibatalkan', className: 'bg-slate-200 text-slate-700' },
  SUPERSEDED: { label: 'Digantikan', className: 'bg-amber-100 text-amber-900' },
};

const UNKNOWN_STATUS = {
  label: 'Status tidak dikenal',
  className: 'bg-slate-100 text-slate-700',
};

export function classSessionStatusMeta(status: string) {
  return STATUS_META[status] ?? UNKNOWN_STATUS;
}
