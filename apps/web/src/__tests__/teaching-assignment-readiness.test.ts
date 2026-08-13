import { getScheduleReadiness } from '../app/dashboard/akademik/_components/teaching-assignment-readiness';

describe('getScheduleReadiness', () => {
  it('membedakan penugasan tanpa jadwal, parsial, siap, dan berlebih', () => {
    expect(getScheduleReadiness({ hoursPerWeek: 2, schedules: [] }).label).toBe('Belum dijadwalkan');
    expect(getScheduleReadiness({
      hoursPerWeek: 2,
      schedules: [{ semester: 1, jpStart: 1, jpEnd: 2 }],
    }).label).toBe('Parsial');
    expect(getScheduleReadiness({
      hoursPerWeek: 2,
      schedules: [
        { semester: 1, jpStart: 1, jpEnd: 2 },
        { semester: 2, jpStart: 3, jpEnd: 4 },
      ],
    }).label).toBe('Siap');
    expect(getScheduleReadiness({
      hoursPerWeek: 2,
      schedules: [{ semester: 1, jpStart: 1, jpEnd: 3 }],
    }).label).toBe('Perlu koreksi');
  });
});
