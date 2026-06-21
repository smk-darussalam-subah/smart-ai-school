/**
 * seed-attendance-demo.ts — DATA ABSENSI DEMO untuk STAGING (uji Beranda kiosk).
 *
 * Seed utama (seed.ts) TIDAK membuat absensi → KPI kehadiran + heatmap + chart +
 * modal drill-down Beranda kosong. Skrip ini mengisi:
 *   - Attendance siswa 10 hari terakhir (status bervariasi DETERMINISTIK).
 *   - TeacherAttendance HARI INI (~80% guru check-in).
 *
 * ⚠️ HANYA UNTUK STAGING (smk_staging_db). JANGAN jalankan di prod — ini absensi
 *    palsu. Idempotent (skipDuplicates) → aman dijalankan ulang.
 *
 * Run (di container staging, DATABASE_URL=smk_staging_db):
 *   docker exec smk-staging-api sh -c 'cd /app/packages/database && \
 *     /app/node_modules/.bin/ts-node --transpile-only \
 *     ../../scripts/seed-attendance-demo.ts'
 */

import { PrismaClient, AttendanceStatus } from '@prisma/client';

const prisma = new PrismaClient();
const DAYS = 10;

/** UTC midnight, N hari lalu (cocok dengan @db.Date + agregasi heatmap). */
function utcDate(daysAgo: number): Date {
  const d = new Date();
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  u.setUTCDate(u.getUTCDate() - daysAgo);
  return u;
}

/** Status deterministik (bukan random) — variasi realistis ~85% hadir. */
function statusFor(studentIdx: number, dayIdx: number): AttendanceStatus {
  const s = studentIdx * 10 + dayIdx;
  if (s % 17 === 0) return AttendanceStatus.alpha;
  if (s % 7 === 0) return AttendanceStatus.sakit;
  if (s % 11 === 0) return AttendanceStatus.izin;
  return AttendanceStatus.hadir;
}

const NOTE: Record<AttendanceStatus, string | null> = {
  hadir: null,
  izin: 'Izin keperluan keluarga',
  sakit: 'Sakit (demam)',
  alpha: 'Tanpa keterangan',
};

async function main() {
  console.log('🌱 Seed absensi DEMO (STAGING)…');

  const students = await prisma.student.findMany({ select: { id: true, classId: true } });
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });
  if (students.length === 0 || !admin) {
    console.log('⚠️  Tidak ada siswa / admin di DB — skip. Jalankan seed.ts dulu.');
    return;
  }

  const rows = [];
  for (let j = 0; j < DAYS; j++) {
    const date = utcDate(j);
    students.forEach((st, i) => {
      if (!st.classId) return;
      const status = statusFor(i, j);
      rows.push({ studentId: st.id, classId: st.classId, date, status, notes: NOTE[status], recordedBy: admin.id });
    });
  }
  const att = await prisma.attendance.createMany({ data: rows, skipDuplicates: true });
  console.log(`✓ Attendance siswa: ${att.count} baris baru (dari ${rows.length}; sisanya sudah ada).`);

  const teachers = await prisma.teacher.findMany({ select: { id: true } });
  const today = utcDate(0);
  const tRows = teachers
    .filter((_, i) => i % 5 !== 0) // ~80% hadir
    .map((t) => ({ teacherId: t.id, date: today, checkInAt: new Date(), outsideGeofence: false }));
  const tAtt = await prisma.teacherAttendance.createMany({ data: tRows, skipDuplicates: true });
  console.log(`✓ Presensi guru hari ini: ${tAtt.count} baris baru (dari ${tRows.length}).`);

  console.log('🎉 Seed absensi demo selesai.');
}

main()
  .catch((err) => { console.error('GAGAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
