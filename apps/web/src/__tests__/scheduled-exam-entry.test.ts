import { getScheduledEntry, readScheduledExamStatus } from '@/lib/scheduled-exam-entry';
import { readStudentTasks } from '@/lib/learner-dashboard-read';

const today = '2026-11-21T';
const at = (clock: string) => Date.parse(today + clock + '+07:00');
const sample = {
  id: 'exam-1',
  type: 'assessment',
  title: 'Matematika',
  subject: 'MAT',
  guru: 'Guru contoh',
  status: 'pending',
  sessionStatus: 'active',
  attemptStarted: false,
  examSchedule: {
    opensAt: today + '08:00:00+07:00',
    latestEntryAt: today + '09:30:00+07:00',
    closesAt: today + '09:30:00+07:00',
    durationMinutes: 60,
  },
};

function task() {
  const result = readStudentTasks({
    status: 'success', httpStatus: 200,
    data: { data: [{ studentId: 'student-1', assignments: [sample] }] },
  }, new Date(at('07:50:00')));
  if (result.state !== 'ready' || !result.data[0]) throw new Error('Scheduled exam task not mapped');
  return result.data[0];
}

describe('scheduled student entry', () => {
  it('maps the official closing time from the scheduled exam', () => {
    expect(task().dueAt).toBe(sample.examSchedule.closesAt);
    expect(task().deadline).toContain('09.30');
  });

  it.each([
    ['07:59:59', false, 'dibuka'],
    ['08:00:00', true, '60 menit'],
    ['08:30:00', true, '60 menit'],
    ['09:00:00', true, '30 menit'],
    ['09:29:59', true, 'kurang dari satu menit'],
    ['09:30:00', false, 'ditutup'],
  ])('evaluates server time %s', (clock, allowed, message) => {
    const result = getScheduledEntry(task(), at(clock));
    expect(result.allowed).toBe(allowed);
    expect(result.message).toContain(message);
  });

  it('fails closed before the server clock is verified and preserves the unscheduled path', () => {
    expect(getScheduledEntry(task(), null).allowed).toBe(false);
    expect(getScheduledEntry({ ...task(), examSchedule: undefined }, null).allowed).toBe(true);
  });

  it('lets an existing attempt request resume after the start cutoff while the room is open', () => {
    const current = task();
    const earlier = { ...current, examSchedule: { ...sample.examSchedule, latestEntryAt: today + '08:15:00+07:00' } };
    expect(getScheduledEntry(earlier, at('08:16:00')).allowed).toBe(false);
    const status = readScheduledExamStatus({
      state: 'working', serverNow: today + '08:16:00+07:00', deadlineAt: today + '09:00:00+07:00',
    });
    expect(getScheduledEntry({ ...earlier, attemptStarted: true }, at('08:16:00'), status)).toMatchObject({ allowed: true, resume: true });
    expect(getScheduledEntry(earlier, at('08:16:00'), status)).toMatchObject({ allowed: true, resume: true });
  });

  it('disables resume at the exact personal deadline while the room is open', () => {
    const current = { ...task(), attemptStarted: true };
    const verified = readScheduledExamStatus({
      state: 'working', serverNow: today + '08:59:59+07:00', deadlineAt: today + '09:00:00+07:00',
    });
    expect(getScheduledEntry(current, at('08:59:59'), verified).allowed).toBe(true);
    expect(getScheduledEntry(current, at('09:00:00'), verified)).toMatchObject({ allowed: false, expired: true });
    const expired = readScheduledExamStatus({
      state: 'expired', serverNow: today + '09:01:00+07:00', deadlineAt: today + '09:00:00+07:00',
    });
    expect(getScheduledEntry(current, at('09:01:00'), expired)).toMatchObject({ allowed: false, expired: true });
  });

  it('fails closed on missing or invalid personal status and keeps submitted receipts distinct', () => {
    const current = { ...task(), attemptStarted: true };
    expect(getScheduledEntry(current, at('08:16:00')).allowed).toBe(false);
    expect(readScheduledExamStatus({ state: 'working', serverNow: today + '08:16:00+07:00' })).toBeNull();
    expect(readScheduledExamStatus({ state: 'working', serverNow: today + '08:16:00+07:00', deadlineAt: 'invalid' })).toBeNull();
    const submitted = readScheduledExamStatus({
      state: 'submitted', serverNow: today + '09:01:00+07:00', deadlineAt: today + '09:00:00+07:00',
      score: null, lateSubmissionStatus: 'pending',
    });
    expect(submitted).toMatchObject({ state: 'submitted', score: null, lateSubmissionStatus: 'pending' });
    expect(getScheduledEntry(current, at('09:01:00'), submitted)).toEqual({ allowed: false, message: 'Jawaban sudah terkirim.' });
  });
});
