import { getScheduleReadiness } from '../app/dashboard/akademik/_components/teaching-assignment-readiness';

describe('getScheduleReadiness', () => {
  it('membedakan penugasan tanpa jadwal, parsial, siap, dan berlebih', () => {
    expect(getScheduleReadiness({ hoursPerWeek: 2, schedules: [] }).label).toBe('Belum dijadwalkan');
    expect(getScheduleReadiness({
      hoursPerWeek: 2,
      schedules: [{ semester: 1, jpStart: 1, jpEnd: 1 }],
    }).label).toBe('Parsial');
    expect(getScheduleReadiness({
      hoursPerWeek: 2,
      schedules: [{ semester: 1, jpStart: 1, jpEnd: 2 }],
    }).label).toBe('Siap');
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
  it('checks occupied JP independently without treating another missing semester as a deficit', () => {
    expect(getScheduleReadiness({ hoursPerWeek: 6, schedules: [{ semester: 1, jpStart: 2, jpEnd: 4 }, { semester: 1, jpStart: 7, jpEnd: 9 }] }).label).toBe('Siap');
    expect(getScheduleReadiness({ hoursPerWeek: 6, schedules: [{ semester: 1, jpStart: 1, jpEnd: 6 }, { semester: 2, jpStart: 1, jpEnd: 5 }] }).label).toBe('Parsial');
    expect(getScheduleReadiness({ hoursPerWeek: 6, schedules: [{ semester: 1, jpStart: 1, jpEnd: 6 }, { semester: 2, jpStart: 1, jpEnd: 7 }] }).label).toBe('Perlu koreksi');
  });
});
