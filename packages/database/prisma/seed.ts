import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ['error'],
});

// =============================================================================
// Helper
// =============================================================================

function uuid(prefix: string, n: number): string {
  const hex = n.toString(16).padStart(4, '0');
  return `${prefix}-0000-0000-0000-${hex.padStart(12, '0')}`;
}

// =============================================================================
// Seed
// =============================================================================

async function main() {
  console.log('🌱 Starting seed — SMK Darussalam Subah...\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // USERS — AUTH SCHEMA
  // Jurusan: AKL, TKJ, TKRO, TBSM (baru)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Super Admin ────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'admin@smkdarussalamsubah.sch.id' },
    update: {},
    create: {
      keycloakId: 'fb0f3a8e-7a8d-4c2f-89b1-3e4c5d6f7a8b',
      email: 'admin@smkdarussalamsubah.sch.id',
      fullName: 'Administrator Sistem',
      phone: '08123456780',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  // ── Kepala Sekolah ─────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'kepala@smkdarussalamsubah.sch.id' },
    update: {},
    create: {
      keycloakId: 'fc1f3a9e-7a8d-4c2f-89b1-3e4c5d6f7a8c',
      email: 'kepala@smkdarussalamsubah.sch.id',
      fullName: 'Drs. H. Abdul Karim, M.Pd',
      phone: '08198765430',
      role: 'KEPALA_SEKOLAH',
      isActive: true,
    },
  });

  // ── Tata Usaha ─────────────────────────────────────────────────────────────
  const tuUser = await prisma.user.upsert({
    where: { email: 'tu@smkdarussalamsubah.sch.id' },
    update: {},
    create: {
      keycloakId: 'fd2f3b0e-7a8d-4c2f-89b1-3e4c5d6f7a8d',
      email: 'tu@smkdarussalamsubah.sch.id',
      fullName: 'Sari Wulandari, S.Pd',
      phone: '08198765431',
      role: 'TATA_USAHA',
      isActive: true,
    },
  });

  // ── Mitra Industri ─────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'industri@smkdarussalamsubah.sch.id' },
    update: {},
    create: {
      keycloakId: 'fe3f3c1e-7a8d-4c2f-89b1-3e4c5d6f7a8e',
      email: 'industri@smkdarussalamsubah.sch.id',
      fullName: 'PT Mitra Teknologi Subah',
      phone: '08567000001',
      role: 'INDUSTRI',
      isActive: true,
    },
  });

  console.log('✓ Admin, Kepala Sekolah, TU, Industri — created');

  // ── 10 Guru (1 per kelas sebagai wali kelas) ───────────────────────────────
  // AKL: 3 guru | TKJ: 3 guru | TKRO: 3 guru | TBSM: 1 guru
  const guruData = [
    // AKL
    { n: 1, name: 'Dra. Hj. Nurul Hidayah, M.Ak',  jurusan: 'AKL',  mapel: 'Akuntansi Dasar' },
    { n: 2, name: 'Lina Marlina, S.E',              jurusan: 'AKL',  mapel: 'Perpajakan' },
    { n: 3, name: 'Rudi Hartono, S.E., M.M',        jurusan: 'AKL',  mapel: 'Perbankan' },
    // TKJ
    { n: 4, name: 'Agus Setiawan, S.Kom',           jurusan: 'TKJ',  mapel: 'Jaringan Komputer' },
    { n: 5, name: 'Budi Prasetyo, S.T',             jurusan: 'TKJ',  mapel: 'Sistem Operasi' },
    { n: 6, name: 'Maya Sari, S.Kom',               jurusan: 'TKJ',  mapel: 'Pemrograman Web' },
    // TKRO
    { n: 7, name: 'Dedi Kurniawan, S.T',            jurusan: 'TKRO', mapel: 'Motor Bensin' },
    { n: 8, name: 'Eko Wahyudi, S.T',               jurusan: 'TKRO', mapel: 'Kelistrikan Otomotif' },
    { n: 9, name: 'Fajar Nugroho, S.T',             jurusan: 'TKRO', mapel: 'Chasis & Pemindah Daya' },
    // TBSM
    { n: 10, name: 'Ganda Pratama, S.T',            jurusan: 'TBSM', mapel: 'Teknik Sepeda Motor' },
  ];

  const guruUsers = [];
  for (const { n, name } of guruData) {
    const u = await prisma.user.upsert({
      where: { email: `guru${n}@smkdarussalamsubah.sch.id` },
      update: {},
      create: {
        keycloakId: uuid('aaaa0000', n),
        email: `guru${n}@smkdarussalamsubah.sch.id`,
        fullName: name,
        phone: `081${String(n).padStart(9, '0')}`,
        role: 'GURU',
        isActive: true,
      },
    });
    guruUsers.push(u);
  }

  console.log('✓ 10 Guru users — created');

  // ── 20 Siswa ───────────────────────────────────────────────────────────────
  const siswaUsers = [];
  for (let i = 0; i < 20; i++) {
    const u = await prisma.user.upsert({
      where: { email: `siswa${i + 1}@smkdarussalamsubah.sch.id` },
      update: {},
      create: {
        keycloakId: uuid('bbbb0000', i + 1),
        email: `siswa${i + 1}@smkdarussalamsubah.sch.id`,
        fullName: `Siswa ${i + 1} SMK Darussalam`,
        phone: `082${String(i + 1).padStart(9, '0')}`,
        role: 'SISWA',
        isActive: true,
      },
    });
    siswaUsers.push(u);
  }

  console.log('✓ 20 Siswa users — created');

  // ── 5 Orang Tua ───────────────────────────────────────────────────────────
  const orangTuaUsers = [];
  for (let i = 0; i < 5; i++) {
    const u = await prisma.user.upsert({
      where: { email: `orangtua${i + 1}@smkdarussalamsubah.sch.id` },
      update: {},
      create: {
        keycloakId: uuid('cccc0000', i + 1),
        email: `orangtua${i + 1}@smkdarussalamsubah.sch.id`,
        fullName: `Orang Tua Siswa ${i + 1}`,
        phone: `083${String(i + 1).padStart(9, '0')}`,
        role: 'ORANG_TUA',
        isActive: true,
      },
    });
    orangTuaUsers.push(u);
  }

  console.log('✓ 5 Orang Tua users — created');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEACHER PROFILES
  // ═══════════════════════════════════════════════════════════════════════════

  const teachers = [];
  for (let i = 0; i < guruUsers.length; i++) {
    const t = await prisma.teacher.upsert({
      where: { userId: guruUsers[i].id },
      update: {},
      create: {
        userId: guruUsers[i].id,
        nip: `19${(75 + i).toString().padStart(2, '0')}0101${String(i + 1).padStart(6, '0')}`,
        isWaliKelas: true,
      },
    });
    teachers.push(t);
  }

  console.log('✓ 10 Teacher profiles — created');

  // ═══════════════════════════════════════════════════════════════════════════
  // ACADEMIC — KELAS
  // Jurusan aktif: AKL, TKJ, TKRO
  // Jurusan baru (persiapan): TBSM (hanya kelas X)
  // ═══════════════════════════════════════════════════════════════════════════

  const kelasData = [
    // AKL — Akuntansi & Keuangan Lembaga
    { name: 'X AKL 1',   majorCode: 'AKL',  grade: 10, teacherIdx: 0 },
    { name: 'XI AKL 1',  majorCode: 'AKL',  grade: 11, teacherIdx: 1 },
    { name: 'XII AKL 1', majorCode: 'AKL',  grade: 12, teacherIdx: 2 },
    // TKJ — Teknik Komputer & Jaringan
    { name: 'X TKJ 1',   majorCode: 'TKJ',  grade: 10, teacherIdx: 3 },
    { name: 'XI TKJ 1',  majorCode: 'TKJ',  grade: 11, teacherIdx: 4 },
    { name: 'XII TKJ 1', majorCode: 'TKJ',  grade: 12, teacherIdx: 5 },
    // TKRO — Teknik Kendaraan Ringan Otomotif
    { name: 'X TKRO 1',  majorCode: 'TKRO', grade: 10, teacherIdx: 6 },
    { name: 'XI TKRO 1', majorCode: 'TKRO', grade: 11, teacherIdx: 7 },
    { name: 'XII TKRO 1',majorCode: 'TKRO', grade: 12, teacherIdx: 8 },
    // TBSM — Teknik & Bisnis Sepeda Motor (dibuka TA 2026/2027)
    { name: 'X TBSM 1',  majorCode: 'TBSM', grade: 10, teacherIdx: 9 },
  ];

  const academicYear = '2025/2026';

  const kelas = [];
  for (const { name, majorCode, grade, teacherIdx } of kelasData) {
    const k = await prisma.class.upsert({
      where: { name_academicYear: { name, academicYear } },
      update: {},
      create: {
        name,
        majorCode,
        grade,
        academicYear,
        capacity: 36,
        teacherId: teachers[teacherIdx]?.id,
        isActive: true,
      },
    });
    kelas.push(k);
  }

  console.log('✓ 10 Kelas (AKL×3, TKJ×3, TKRO×3, TBSM×1) — created');

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT PROFILES
  // Distribusi: 2 siswa per kelas × 10 kelas = 20 siswa
  // ═══════════════════════════════════════════════════════════════════════════

  for (let i = 0; i < siswaUsers.length; i++) {
    const kelasIdx = Math.floor(i / 2) % kelas.length;
    await prisma.student.upsert({
      where: { userId: siswaUsers[i].id },
      update: {},
      create: {
        userId: siswaUsers[i].id,
        nis: `20250${String(i + 1).padStart(4, '0')}`,
        classId: kelas[kelasIdx]?.id,
        parentId: i < 5 ? orangTuaUsers[i]?.id : undefined,
        status: 'active',
        joinedAt: new Date('2025-07-14'),
      },
    });
  }

  console.log('✓ 20 Student profiles — distributed across 10 kelas');

  // ═══════════════════════════════════════════════════════════════════════════
  // PPDB — LEADS (berbagai status)
  // ═══════════════════════════════════════════════════════════════════════════

  const leadsData = [
    {
      id: 'aaaaaaaa-0001-0000-0000-000000000001',
      fullName: 'Ahmad Rizki Maulana',
      phone: '08123456789',
      schoolOrigin: 'SMP Negeri 1 Subah',
      interestMajor: 'TKJ',
      source: 'website'  as const,
      status: 'new'       as const,
      assignedTo: guruUsers[3]?.id, // guru TKJ
    },
    {
      id: 'aaaaaaaa-0001-0000-0000-000000000002',
      fullName: 'Budi Hermanto',
      phone: '08234567890',
      schoolOrigin: 'SMP Negeri 2 Subah',
      interestMajor: 'AKL',
      source: 'referral'  as const,
      status: 'contacted' as const,
      assignedTo: guruUsers[0]?.id, // guru AKL
    },
    {
      id: 'aaaaaaaa-0001-0000-0000-000000000003',
      fullName: 'Citra Dewi Lestari',
      phone: '08345678901',
      schoolOrigin: 'SMP Islam Subah',
      interestMajor: 'AKL',
      source: 'instagram'  as const,
      status: 'interested' as const,
      assignedTo: guruUsers[1]?.id,
    },
    {
      id: 'aaaaaaaa-0001-0000-0000-000000000004',
      fullName: 'Dina Salsabila',
      phone: '08456789012',
      schoolOrigin: 'SMP Negeri 3 Subah',
      interestMajor: 'TKRO',
      source: 'tiktok'     as const,
      status: 'registered' as const,
      assignedTo: guruUsers[6]?.id, // guru TKRO
    },
    {
      id: 'aaaaaaaa-0001-0000-0000-000000000005',
      fullName: 'Eka Putra Ramadhan',
      phone: '08567890123',
      schoolOrigin: 'SMP Swasta Al-Hidayah',
      interestMajor: 'TBSM',
      source: 'event'     as const,
      status: 'paid'      as const,
      assignedTo: guruUsers[9]?.id, // guru TBSM
    },
  ];

  for (const lead of leadsData) {
    await prisma.ppdbLead.upsert({
      where: { id: lead.id },
      update: {},
      create: lead,
    });
  }

  console.log('✓ 5 PPDB Leads (new→paid pipeline) — created');

  // ═══════════════════════════════════════════════════════════════════════════
  // AI KNOWLEDGE — DOCUMENT
  // ═══════════════════════════════════════════════════════════════════════════

  await prisma.knowledgeDocument.upsert({
    where: { id: 'bbbbbbbb-0001-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'bbbbbbbb-0001-0000-0000-000000000001',
      title: 'Panduan Kurikulum SMK Darussalam Subah',
      content:
        'SMK Darussalam Subah menyelenggarakan 4 program keahlian: ' +
        'AKL (Akuntansi dan Keuangan Lembaga), ' +
        'TKJ (Teknik Komputer dan Jaringan), ' +
        'TKRO (Teknik Kendaraan Ringan Otomotif), ' +
        'dan TBSM (Teknik dan Bisnis Sepeda Motor) yang akan dibuka TA 2026/2027.',
      source: 'internal',
      category: 'curriculum',
      isActive: true,
    },
  });

  console.log('✓ AI Knowledge document — created\n');

  // ── Ringkasan ─────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('🎉 Seed completed! SMK Darussalam Subah data:');
  console.log('   Users    : 4 staff + 10 guru + 20 siswa + 5 ortu + 1 industri = 40');
  console.log('   Kelas    : AKL(3) + TKJ(3) + TKRO(3) + TBSM(1) = 10');
  console.log('   Leads    : 5 (new→contacted→interested→registered→paid)');
  console.log('   Roles    : SUPER_ADMIN, KEPALA_SEKOLAH, TATA_USAHA, GURU,');
  console.log('              SISWA, ORANG_TUA, INDUSTRI (7 total)');
  console.log('═══════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
