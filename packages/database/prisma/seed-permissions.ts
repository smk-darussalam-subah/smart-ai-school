import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ['error'],
});

interface PermissionDef {
  code: string;
  description: string;
  module: string;
}

const PERMISSIONS: PermissionDef[] = [
  { code: 'student.create', description: 'Membuat data siswa baru', module: 'student' },
  { code: 'student.read', description: 'Melihat data siswa', module: 'student' },
  { code: 'student.update', description: 'Mengubah data siswa', module: 'student' },
  { code: 'student.delete', description: 'Menghapus data siswa (soft delete)', module: 'student' },
  { code: 'student.own.read', description: 'Melihat data diri sendiri (SISWA)', module: 'student' },
  { code: 'student.child.read', description: 'Melihat data anak (ORANG_TUA)', module: 'student' },
  { code: 'academic.grade.create', description: 'Membuat nilai', module: 'academic' },
  { code: 'academic.grade.read', description: 'Melihat nilai', module: 'academic' },
  { code: 'academic.grade.update', description: 'Mengubah nilai', module: 'academic' },
  { code: 'academic.grade.approve', description: 'Menyetujui nilai', module: 'academic' },
  { code: 'academic.attendance.create', description: 'Membuat absensi', module: 'academic' },
  { code: 'academic.attendance.read', description: 'Melihat absensi', module: 'academic' },
  { code: 'academic.teaching.read', description: 'Melihat teaching assignment', module: 'academic' },
  { code: 'academic.teaching.manage', description: 'Mengelola teaching assignment', module: 'academic' },
  { code: 'academic.schedule.read', description: 'Melihat jadwal', module: 'academic' },
  { code: 'academic.schedule.manage', description: 'Mengelola jadwal', module: 'academic' },
  { code: 'grade.own.read', description: 'Melihat nilai sendiri (SISWA)', module: 'grade' },
  { code: 'grade.child.read', description: 'Melihat nilai anak (ORANG_TUA)', module: 'grade' },
  { code: 'attendance.own.read', description: 'Melihat absensi sendiri (SISWA)', module: 'attendance' },
  { code: 'attendance.child.read', description: 'Melihat absensi anak (ORANG_TUA)', module: 'attendance' },
  { code: 'ppdb.create', description: 'Membuat lead PPDB', module: 'ppdb' },
  { code: 'ppdb.read', description: 'Melihat data PPDB', module: 'ppdb' },
  { code: 'ppdb.update', description: 'Mengubah status lead PPDB', module: 'ppdb' },
  { code: 'ppdb.stats.read', description: 'Melihat statistik PPDB (GURU)', module: 'ppdb' },
  { code: 'finance.create', description: 'Mencatat pembayaran SPP', module: 'finance' },
  { code: 'finance.read', description: 'Melihat data keuangan', module: 'finance' },
  { code: 'finance.update', description: 'Mengubah data keuangan', module: 'finance' },
  { code: 'finance.approve', description: 'Menyetujui pembayaran SPP', module: 'finance' },
  { code: 'finance.own.read', description: 'Melihat SPP sendiri (SISWA)', module: 'finance' },
  { code: 'finance.child.read', description: 'Melihat SPP anak (ORANG_TUA)', module: 'finance' },
  { code: 'ai.chat', description: 'Menggunakan AI Chat', module: 'ai' },
  { code: 'ai.knowledge.create', description: 'Membuat dokumen knowledge', module: 'ai' },
  { code: 'ai.knowledge.read', description: 'Melihat knowledge base', module: 'ai' },
  { code: 'ai.knowledge.update', description: 'Mengubah knowledge base', module: 'ai' },
  { code: 'ai.knowledge.delete', description: 'Menghapus knowledge base', module: 'ai' },
  { code: 'notification.manage', description: 'Mengelola notifikasi', module: 'notification' },
  { code: 'notification.read', description: 'Melihat notifikasi', module: 'notification' },
  { code: 'audit.read', description: 'Melihat audit log', module: 'audit' },
  { code: 'permissions.manage', description: 'Mengelola permission & RBAC', module: 'permissions' },
  { code: 'permissions.read', description: 'Melihat konfigurasi permission', module: 'permissions' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.code),
  KEPALA_SEKOLAH: [
    'student.read', 'academic.grade.read', 'academic.attendance.read',
    'academic.teaching.read', 'academic.schedule.read',
    'finance.read', 'finance.approve',
    'ppdb.read', 'ppdb.stats.read',
    'ai.knowledge.read', 'notification.read', 'audit.read',
  ],
  TATA_USAHA: [
    'student.create', 'student.read', 'student.update', 'student.delete',
    'ppdb.create', 'ppdb.read', 'ppdb.update',
    'finance.create', 'finance.read', 'finance.update',
    'notification.read', 'notification.manage',
  ],
  GURU: [
    'academic.grade.create', 'academic.grade.read', 'academic.grade.update',
    'academic.attendance.create', 'academic.attendance.read',
    'academic.teaching.read', 'academic.schedule.read',
    'student.read', 'ppdb.stats.read', 'ai.knowledge.read',
  ],
  SISWA: [
    'student.own.read', 'grade.own.read', 'attendance.own.read',
    'finance.own.read', 'ai.chat',
  ],
  ORANG_TUA: [
    'student.child.read', 'grade.child.read', 'attendance.child.read',
    'finance.child.read',
  ],
  INDUSTRI: [
    'student.read',
  ],
};

async function main() {
  console.log('🔑 Seeding RBAC permissions...\n');

  // Upsert semua permission definitions
  const permissionMap = new Map<string, string>();
  for (const perm of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, module: perm.module },
      create: perm,
    });
    permissionMap.set(perm.code, record.id);
    console.log(`  ✅ ${perm.code}`);
  }

  console.log(`\n📋 ${PERMISSIONS.length} permissions tersedia\n`);

  // Assign permissions ke role
  for (const [role, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const permIds = permCodes
      .map((code) => permissionMap.get(code))
      .filter((id): id is string => id !== undefined);

    for (const permId of permIds) {
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as never, permissionId: permId } },
        update: {},
        create: { role: role as never, permissionId: permId },
      });
    }
    console.log(`  🔗 ${role} → ${permIds.length} permissions`);
  }

  console.log('\n✅ Seed RBAC selesai');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
