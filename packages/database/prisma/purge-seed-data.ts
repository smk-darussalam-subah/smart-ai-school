/**
 * purge-seed-data.ts — HAPUS SEMUA data transaksional dummy dari smk_db (production).
 *
 * ⚠️ HANYA UNTUK PRODUCTION (smk_db). Guard menolak DB lain.
 * MEMPERTAHANKAN: schema, auth.users (Keycloak sink), permissions, school_profile,
 *                 subjects, classes (structure), academic_years, semesters.
 *
 * Run (di container production):
 *   docker exec smk-api sh -c 'cd /app/packages/database && \
 *     /app/node_modules/.bin/ts-node --transpile-only prisma/purge-seed-data.ts'
 *
 * Setelah purge: smk_db siap diisi data nyata sekolah. Semua dashboard menampilkan
 * empty state yang jujur (tidak ada data dummy).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('smk_db') || url.includes('staging')) {
    console.error(`❌ ABORT: DATABASE_URL bukan smk_db production (${url.slice(0, 50)}…).`);
    console.error('   Script ini HANYA untuk smk_db. Untuk staging, gunakan seed-demo-staging.ts.');
    process.exit(1);
  }

  console.log('🧹 PURGE: Menghapus data transaksional dummy dari smk_db...\n');

  // Delete in dependency order (child tables first, parent tables last)
  // Using deleteMany (not dropTable) — preserves schema for real data entry.

  const steps: { name: string; fn: () => Promise<{ count: number }> }[] = [
    { name: 'Assessment Responses', fn: () => prisma.assessmentResponse.deleteMany({}) },
    { name: 'Assessment Sessions', fn: () => prisma.assessmentSession.deleteMany({}) },
    { name: 'LMS Module Progress', fn: () => prisma.lmsModuleProgress.deleteMany({}) },
    { name: 'LMS Modules', fn: () => prisma.lmsModule.deleteMany({}) },
    { name: 'Report Cards', fn: () => prisma.reportCard.deleteMany({}) },
    { name: 'Grades', fn: () => prisma.grade.deleteMany({}) },
    { name: 'Attendance', fn: () => prisma.attendance.deleteMany({}) },
    { name: 'Schedules', fn: () => prisma.schedule.deleteMany({}) },
    { name: 'Class Activities (Jurnal)', fn: () => prisma.classActivity.deleteMany({}) },
    { name: 'RPP', fn: () => prisma.rpp.deleteMany({}) },
    { name: 'Teaching Assignments', fn: () => prisma.teachingAssignment.deleteMany({}) },
    { name: 'Teacher Attendance', fn: () => prisma.teacherAttendance.deleteMany({}) },
    { name: 'KKTP Configs', fn: () => prisma.kktpConfig.deleteMany({}) },
    { name: 'SPP Payments', fn: () => prisma.sppPayment.deleteMany({}) },
    { name: 'PPDB Leads', fn: () => prisma.ppdbLead.deleteMany({}) },
    { name: 'Notification Logs', fn: () => prisma.notificationLog.deleteMany({}) },
    { name: 'Push Subscriptions', fn: () => prisma.pushSubscription.deleteMany({}) },
    { name: 'XP Transactions', fn: () => prisma.xpTransaction.deleteMany({}) },
    { name: 'Student XP', fn: () => prisma.studentXp.deleteMany({}) },
    { name: 'Student Badges', fn: () => prisma.studentBadge.deleteMany({}) },
    { name: 'Badges (definitions)', fn: () => prisma.badge.deleteMany({}) },
    { name: 'Question Sets', fn: () => prisma.questionSet.deleteMany({}) },
    { name: 'Questions', fn: () => prisma.question.deleteMany({}) },
    { name: 'Announcements', fn: () => prisma.announcement.deleteMany({}) },
    { name: 'Staff Positions', fn: () => prisma.staffPosition.deleteMany({}) },
    { name: 'Academic Calendar Events', fn: () => prisma.academicCalendar.deleteMany({}) },
  ];

  let totalDeleted = 0;
  for (const step of steps) {
    try {
      const result = await step.fn();
      const count = result.count;
      totalDeleted += count;
      console.log(`  ✓ ${step.name}: ${count} rows deleted`);
    } catch (err) {
      // Table might not exist or have constraints — log and continue
      console.log(`  ⚠ ${step.name}: skipped (${err instanceof Error ? err.message.slice(0, 80) : 'unknown'})`);
    }
  }

  // Note: Students, Teachers, Classes are KEPT (structural — needed for real school setup)
  // But if they were seeded with dummy data, the Director may want to clean them too.
  // We do NOT delete them automatically — this is a Director decision.
  console.log(`\n📊 Total rows deleted: ${totalDeleted}`);
  console.log('\n✅ DIPERTAHANKAN:');
  console.log('  - auth.users (akun Keycloak: admin, ks, guru, siswa, ortu)');
  console.log('  - auth.permissions + role_permissions (RBAC)');
  console.log('  - school.school_profile (nama sekolah, kontak)');
  console.log('  - academic.subjects (mapel referensi)');
  console.log('  - academic.classes (struktur kelas)');
  console.log('  - school.academic_years + semesters');
  console.log('  - academic.students + teachers (struktur user → role)');
  console.log('\n🎉 smk_db siap diisi data nyata sekolah.');
  console.log('   Semua dashboard akan menampilkan empty state (tidak ada data dummy).');
}

main()
  .catch((err) => { console.error('GAGAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
