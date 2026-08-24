import { AutoGenerateScheduleQuerySchema } from '../schedule/dto/list-schedule.dto';
import { CreateCalendarEventSchema, ListCalendarEventsQuerySchema } from '../school-config/dto/calendar-event.dto';
import { CreateMajorSchema, UpdateMajorSchema } from '../school-config/dto/major.dto';
import { UpdateProfileSchema } from '../school-config/dto/update-profile.dto';
import { UpdateMeSchema } from '../auth/dto/update-me.dto';
import { RemoveKktpParamsSchema } from '../kktp-config/dto/kktp-config.dto';
import { ListUsersQuerySchema } from '../users/dto/list-users.dto';

describe('Wave 8 operational trust DTO contracts', () => {
  it('validates calendar event ranges and rejects unknown fields', () => {
    expect(CreateCalendarEventSchema.safeParse({
      academicYearId: '11111111-1111-4111-8111-111111111111',
      name: 'Ujian Tengah Semester',
      startDate: '2026-09-21',
      endDate: '2026-09-20',
      type: 'exam',
    }).success).toBe(false);

    expect(CreateCalendarEventSchema.safeParse({
      academicYearId: '11111111-1111-4111-8111-111111111111',
      name: 'Ujian Tengah Semester',
      startDate: '2026-09-21',
      endDate: '2026-09-22',
      type: 'exam',
      unsafe: true,
    }).success).toBe(false);

    const parsed = CreateCalendarEventSchema.parse({
      academicYearId: '11111111-1111-4111-8111-111111111111',
      name: '  Jeda Semester  ',
      startDate: '2026-12-21',
      endDate: '2026-12-28',
      type: 'break',
      description: '   ',
    });
    expect(parsed.name).toBe('Jeda Semester');
    expect(parsed.description).toBeNull();
  });

  it('validates calendar list filters with an exact allowlist', () => {
    expect(ListCalendarEventsQuerySchema.safeParse({ type: 'holiday' }).success).toBe(true);
    expect(ListCalendarEventsQuerySchema.safeParse({ type: 'libur' }).success).toBe(false);
    expect(ListCalendarEventsQuerySchema.safeParse({ page: '1' }).success).toBe(false);
  });

  it('normalizes major codes and keeps productive context bounded', () => {
    const created = CreateMajorSchema.parse({
      code: ' tjkt-1 ',
      name: ' Teknik Jaringan Komputer ',
      description: '  Konteks produktif jaringan sekolah.  ',
    });
    expect(created).toMatchObject({
      code: 'TJKT-1',
      name: 'Teknik Jaringan Komputer',
      description: 'Konteks produktif jaringan sekolah.',
    });

    expect(UpdateMajorSchema.safeParse({ code: 'tk j' }).success).toBe(false);
    expect(UpdateMajorSchema.safeParse({ description: 'x'.repeat(801) }).success).toBe(false);
  });

  it('rejects unsafe profile and avatar URLs', () => {
    expect(UpdateProfileSchema.safeParse({ website: 'javascript:alert(1)' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ logoUrl: 'https://user:pass@example.sch.id/logo.png' }).success).toBe(false);
    expect(UpdateMeSchema.safeParse({ avatarUrl: 'data:image/png;base64,abc' }).success).toBe(false);

    const parsed = UpdateProfileSchema.parse({ website: ' https://smk.example.sch.id/profil ' });
    expect(parsed.website).toBe('https://smk.example.sch.id/profil');
  });

  it('validates academic period query contracts consistently', () => {
    expect(AutoGenerateScheduleQuerySchema.safeParse({
      academicYear: '2026/2027',
      semester: '2',
      days: '6',
      jpPerDay: '8',
      maxJpGuru: '24',
    }).success).toBe(true);
    expect(AutoGenerateScheduleQuerySchema.safeParse({ academicYear: '2026', semester: '1' }).success).toBe(false);
    expect(AutoGenerateScheduleQuerySchema.safeParse({ academicYear: '2026/2027', semester: '3' }).success).toBe(false);

    expect(RemoveKktpParamsSchema.safeParse({
      subject: 'Matematika',
      academicYear: '2026/2027',
      semester: '1',
    }).success).toBe(true);
    expect(RemoveKktpParamsSchema.safeParse({
      subject: 'Matematika',
      academicYear: '2026-2027',
      semester: '1',
    }).success).toBe(false);
  });

  it('accepts only six stable identity roles for Users list filters', () => {
    expect(ListUsersQuerySchema.safeParse({ role: 'GURU' }).success).toBe(true);
    expect(ListUsersQuerySchema.safeParse({ role: 'KEPALA_SEKOLAH' }).success).toBe(false);
    expect(ListUsersQuerySchema.safeParse({ role: 'WAKA_KURIKULUM' }).success).toBe(false);
  });
});
