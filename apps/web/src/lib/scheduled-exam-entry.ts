import type { SiswaTugas } from '@/app/dashboard/akademik/_components/siswa/siswa-types';

const time = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export const formatExamTime = (value: string) => time.format(new Date(value)) + ' WIB';

export function readScheduledExamStatus(data: unknown) {
  if (!data || typeof data !== 'object' || !('state' in data) || !('serverNow' in data) || !('deadlineAt' in data)) return null;
  const { state, serverNow, deadlineAt } = data;
  if (state !== 'working' && state !== 'expired' && state !== 'submitted') return null;
  if (typeof serverNow !== 'string' || !Number.isFinite(Date.parse(serverNow))) return null;
  if (deadlineAt !== null && (typeof deadlineAt !== 'string' || !Number.isFinite(Date.parse(deadlineAt)))) return null;
  const score = 'score' in data && typeof data.score === 'number' ? data.score : null;
  const late = 'lateSubmissionStatus' in data ? data.lateSubmissionStatus : null;
  return { state, serverTime: Date.parse(serverNow), deadline: deadlineAt === null ? null : Date.parse(deadlineAt),
    score, lateSubmissionStatus: late === 'pending' || late === 'rejected' ? late : null };
}

type ScheduledExamStatus = NonNullable<ReturnType<typeof readScheduledExamStatus>>;

export function getScheduledEntry(task: SiswaTugas, serverTime: number | null, status?: ScheduledExamStatus | null) {
  if (!task.examSchedule) return { allowed: true, message: null };
  if (serverTime === null) return { allowed: false, message: 'Memeriksa waktu ujian dari server.' };
  const { opensAt, latestEntryAt, closesAt, durationMinutes } = task.examSchedule;
  const deadline = status?.deadline ?? null;
  if (status?.state === 'submitted') return { allowed: false, message: 'Jawaban sudah terkirim.' };
  if (deadline !== null && (status?.state === 'expired' || serverTime >= deadline)) {
    return { allowed: false, expired: true, message: 'Waktu pengerjaan Anda telah habis.' };
  }
  if (task.sessionStatus !== 'active' || serverTime >= Date.parse(closesAt)) {
    return { allowed: false, message: 'Waktu ujian telah ditutup.' };
  }
  if (serverTime < Date.parse(opensAt)) {
    return { allowed: false, message: 'Ujian dibuka ' + formatExamTime(opensAt) + '.' };
  }
  if (deadline !== null) return { allowed: true, resume: true, message: 'Lanjutkan dengan sisa waktu dari attempt awal.' };
  if (task.attemptStarted) return { allowed: false, message: 'Tenggat pengerjaan belum dapat dipastikan.' };
  if (serverTime > Date.parse(latestEntryAt)) {
    return { allowed: false, message: 'Batas masuk ujian telah terlewati.' };
  }
  const seconds = Math.floor(Math.min(Date.parse(closesAt) - serverTime, durationMinutes * 60_000) / 1000);
  const effectiveTime = seconds < 60 ? 'kurang dari satu menit' : Math.floor(seconds / 60) + ' menit';
  return { allowed: true, message: 'Jika mulai sekarang, waktu dasar Anda ' + effectiveTime + '.' };
}
