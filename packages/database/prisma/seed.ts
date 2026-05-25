import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ═══════════════════════════════════════════════════════════════════════════
  // USERS & ROLES
  // ═══════════════════════════════════════════════════════════════════════════

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@smkdarussalamsubah.sch.id' },
    update: {},
    create: {
      keycloakId: 'fb0f3a8e-7a8d-4c2f-89b1-3e4c5d6f7a8b',
      email: 'admin@smkdarussalamsubah.sch.id',
      fullName: 'Administrator Sistem',
      phone: '08123456789',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log('✓ Admin user created/updated');

  // Kepala Sekolah
  const kepalaSekolah = await prisma.user.upsert({
    where: { email: 'kepala@smkdarussalamsubah.sch.id' },
    update: {},
    create: {
      keycloakId: 'fc1f3a9e-7a8d-4c2f-89b1-3e4c5d6f7a8c',
      email: 'kepala@smkdarussalamsubah.sch.id',
      fullName: 'Drs. Kepala Sekolah',
      phone: '08198765432',
      role: 'KEPALA_SEKOLAH',
      isActive: true,
    },
  });

  // 5 Guru
  const gurus = await Promise.all(
    [
      {
        keycloakId: '12345678-1234-1234-1234-123456789abc',
        email: 'guru.agus@smkdarussalamsubah.sch.id',
        fullName: 'Agus Hermawan, S.Pd',
      },
      {
        keycloakId: '12345678-1234-1234-1234-123456789abd',
        email: 'guru.siti@smkdarussalamsubah.sch.id',
        fullName: 'Siti Nurhaliza, S.Pd',
      },
      {
        keycloakId: '12345678-1234-1234-1234-123456789abe',
        email: 'guru.budi@smkdarussalamsubah.sch.id',
        fullName: 'Budi Santoso, S.T',
      },
      {
        keycloakId: '12345678-1234-1234-1234-123456789abf',
        email: 'guru.rina@smkdarussalamsubah.sch.id',
        fullName: 'Rina Wijaya, S.Kom',
      },
      {
        keycloakId: '12345678-1234-1234-1234-123456789ab0',
        email: 'guru.hendra@smkdarussalamsubah.sch.id',
        fullName: 'Hendra Gunawan, S.Pd.T',
      },
    ].map((guru) =>
      prisma.user.upsert({
        where: { email: guru.email },
        update: {},
        create: {
          ...guru,
          phone: `08${Math.random().toString().slice(2, 11)}`,
          role: 'GURU',
          isActive: true,
        },
      }),
    ),
  );

  console.log('✓ 5 Guru users created/updated');

  // 20 Siswa
  const siswaUsers = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      prisma.user.upsert({
        where: { email: `siswa${i + 1}@smkdarussalamsubah.sch.id` },
        update: {},
        create: {
          keycloakId: randomUUID(),
          email: `siswa${i + 1}@smkdarussalamsubah.sch.id`,
          fullName: `Siswa ${i + 1}`,
          phone: `08${Math.random().toString().slice(2, 11)}`,
          role: 'SISWA',
          isActive: true,
        },
      }),
    ),
  );

  console.log('✓ 20 Siswa users created/updated');

  // 5 Orang Tua
  const orangTuaUsers = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.user.upsert({
        where: { email: `orangtua${i + 1}@smkdarussalamsubah.sch.id` },
        update: {},
        create: {
          keycloakId: randomUUID(),
          email: `orangtua${i + 1}@smkdarussalamsubah.sch.id`,
          fullName: `Orang Tua ${i + 1}`,
          phone: `08${Math.random().toString().slice(2, 11)}`,
          role: 'ORANG_TUA',
          isActive: true,
        },
      }),
    ),
  );

  console.log('✓ 5 Orang Tua users created/updated');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEACHER — GURU PROFILES (must be before Class creation)
  // ═══════════════════════════════════════════════════════════════════════════

  const teachers = await Promise.all(
    gurus.map((guru, i) =>
      prisma.teacher.upsert({
        where: { userId: guru.id },
        update: {},
        create: {
          userId: guru.id,
          nip: `19${80 + i}0101${String(i + 1).padStart(5, '0')}`,
          isWaliKelas: i < 3,
        },
      }),
    ),
  );

  console.log('✓ 5 Guru profiles created/updated');

  // ═══════════════════════════════════════════════════════════════════════════
  // ACADEMIC — KELAS
  // ═══════════════════════════════════════════════════════════════════════════

  const kelasData = [
    {
      name: 'X RPL 1',
      majorCode: 'RPL',
      grade: 10,
      academicYear: '2025/2026',
      capacity: 36,
      teacherId: teachers[0]?.id,
    },
    {
      name: 'XI RPL 1',
      majorCode: 'RPL',
      grade: 11,
      academicYear: '2025/2026',
      capacity: 36,
      teacherId: teachers[1]?.id,
    },
    {
      name: 'XII RPL 1',
      majorCode: 'RPL',
      grade: 12,
      academicYear: '2025/2026',
      capacity: 36,
      teacherId: teachers[2]?.id,
    },
  ];

  const kelas = await Promise.all(
    kelasData.map((k) =>
      prisma.class.upsert({
        where: { name_academicYear: { name: k.name, academicYear: k.academicYear } },
        update: {},
        create: k,
      }),
    ),
  );

  console.log('✓ 3 Kelas created/updated');

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT — SISWA
  // ═══════════════════════════════════════════════════════════════════════════

  const students = await Promise.all(
    siswaUsers.map((user, i) =>
      prisma.student.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          nis: `2025${String(i + 1).padStart(5, '0')}`,
          classId: kelas[i % 3]?.id,
          parentId: i < 5 ? orangTuaUsers[i]?.id : undefined,
          status: 'active',
          joinedAt: new Date('2025-01-01'),
        },
      }),
    ),
  );

  console.log('✓ 20 Siswa profiles created/updated');

  // ═══════════════════════════════════════════════════════════════════════════
  // PPDB — LEADS
  // ═══════════════════════════════════════════════════════════════════════════

  const leadIds = [
    'aaaaaaaa-0001-0000-0000-000000000001',
    'aaaaaaaa-0001-0000-0000-000000000002',
    'aaaaaaaa-0001-0000-0000-000000000003',
    'aaaaaaaa-0001-0000-0000-000000000004',
    'aaaaaaaa-0001-0000-0000-000000000005',
  ];

  const leads = await Promise.all(
    [
      {
        id: leadIds[0],
        fullName: 'Ahmad Rizki',
        phone: '08123456789',
        schoolOrigin: 'SMP Negeri 1 Subah',
        interestMajor: 'RPL',
        source: 'website' as const,
        status: 'new' as const,
        assignedTo: gurus[0]?.id,
      },
      {
        id: leadIds[1],
        fullName: 'Budi Hermanto',
        phone: '08234567890',
        schoolOrigin: 'SMP Negeri 2 Subah',
        interestMajor: 'RPL',
        source: 'referral' as const,
        status: 'contacted' as const,
        assignedTo: gurus[1]?.id,
      },
      {
        id: leadIds[2],
        fullName: 'Citra Dewi',
        phone: '08345678901',
        schoolOrigin: 'SMP Islam Subah',
        interestMajor: 'RPL',
        source: 'instagram' as const,
        status: 'interested' as const,
        assignedTo: gurus[2]?.id,
      },
      {
        id: leadIds[3],
        fullName: 'Dina Salsabila',
        phone: '08456789012',
        schoolOrigin: 'SMP Negeri 3 Subah',
        interestMajor: 'RPL',
        source: 'tiktok' as const,
        status: 'registered' as const,
        assignedTo: gurus[3]?.id,
      },
      {
        id: leadIds[4],
        fullName: 'Eka Putra',
        phone: '08567890123',
        schoolOrigin: 'SMP Swasta Subah',
        interestMajor: 'RPL',
        source: 'event' as const,
        status: 'paid' as const,
        assignedTo: gurus[4]?.id,
      },
    ].map((lead) =>
      prisma.ppdbLead.upsert({
        where: { id: lead.id },
        update: {},
        create: lead,
      }),
    ),
  );

  console.log('✓ 5 PPDB Leads created/updated');

  // ═══════════════════════════════════════════════════════════════════════════
  // AI KNOWLEDGE — DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  await prisma.knowledgeDocument.upsert({
    where: { id: 'bbbbbbbb-0001-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'bbbbbbbb-0001-0000-0000-000000000001',
      title: 'Panduan Kurikulum SMK RPL',
      content:
        'Kurikulum Rekayasa Perangkat Lunak (RPL) mencakup mata pelajaran teknologi informasi, pemrograman, dan pengembangan web.',
      source: 'internal',
      category: 'curriculum',
      isActive: true,
    },
  });

  console.log('✓ AI Knowledge documents created/updated');

  // ═══════════════════════════════════════════════════════════════════════════

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
