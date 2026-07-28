import {
  appointmentStatusLabel,
  formatAppointmentDate,
} from '../app/dashboard/struktur-organisasi/struktur-ui';

describe('struktur organisasi appointment UI helpers', () => {
  it('labels effective active appointment as effective authority', () => {
    expect(appointmentStatusLabel('ACTIVE', true)).toBe('Efektif');
  });

  it('keeps non-effective lifecycle status visible', () => {
    expect(appointmentStatusLabel('APPROVED', false)).toBe('Disetujui');
    expect(appointmentStatusLabel('SUSPENDED', false)).toBe('Cuti/PLT');
  });

  it('formats open-ended appointment dates clearly', () => {
    expect(formatAppointmentDate(null)).toBe('tanpa batas');
  });
});
