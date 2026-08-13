export interface ScheduleReadinessInput {
  hoursPerWeek: number;
  schedules: Array<{ semester: number; jpStart: number; jpEnd: number }>;
}

export interface ScheduleReadiness {
  label: 'Belum dijadwalkan' | 'Parsial' | 'Siap' | 'Perlu koreksi';
  detail: string;
  tone: string;
}

export function getScheduleReadiness(item: ScheduleReadinessInput): ScheduleReadiness {
  const bySemester = new Map<number, number>();
  for (const slot of item.schedules ?? []) {
    bySemester.set(slot.semester, (bySemester.get(slot.semester) ?? 0) + slot.jpEnd - slot.jpStart + 1);
  }
  if (bySemester.size === 0) {
    return { label: 'Belum dijadwalkan', detail: 'S1 0 JP · S2 0 JP', tone: 'text-amber-700' };
  }
  const detail = [1, 2].map((semester) => `S${semester} ${bySemester.get(semester) ?? 0} JP`).join(' · ');
  const values = [...bySemester.values()];
  if (values.some((hours) => hours > item.hoursPerWeek)) {
    return { label: 'Perlu koreksi', detail, tone: 'text-rose-700' };
  }
  if (values.some((hours) => hours < item.hoursPerWeek) || bySemester.size < 2) {
    return { label: 'Parsial', detail, tone: 'text-amber-700' };
  }
  return { label: 'Siap', detail, tone: 'text-emerald-700' };
}
