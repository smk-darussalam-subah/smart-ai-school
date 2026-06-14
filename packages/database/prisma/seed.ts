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
  // keycloakId = UUID asli dari Keycloak realm 'diis' (bukan placeholder)
  await prisma.user.upsert({
    where: { email: 'admin@smkdarussalamsubah.sch.id' },
    update: { keycloakId: '87ea6d9f-092d-4b74-940a-643961103a54' },
    create: {
      keycloakId: '87ea6d9f-092d-4b74-940a-643961103a54',
      email: 'admin@smkdarussalamsubah.sch.id',
      fullName: 'Administrator Sistem',
      phone: '08123456780',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  // ── Kepala Sekolah ─────────────────────────────────────────────────────────
  const ksUser = await prisma.user.upsert({
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
        isWaliKelas: true,
      },
    });
    teachers.push(t);
  }

  console.log('✓ 10 Teacher profiles — created');

  // ── Staff (kepegawaian) — KS, TU, dan 10 guru (NIY + status) ────────────────
  await prisma.staff.upsert({
    where: { userId: ksUser.id },
    update: {},
    create: { userId: ksUser.id, niy: 'Y0001', employmentStatus: 'GTY', joinedAt: new Date('2010-07-01') },
  });
  await prisma.staff.upsert({
    where: { userId: tuUser.id },
    update: {},
    create: { userId: tuUser.id, niy: 'Y0101', employmentStatus: 'PTY', joinedAt: new Date('2015-07-01') },
  });
  for (let i = 0; i < guruUsers.length; i++) {
    await prisma.staff.upsert({
      where: { userId: guruUsers[i].id },
      update: {},
      create: {
        userId: guruUsers[i].id,
        niy: `Y${(10 + i).toString().padStart(4, '0')}`,
        employmentStatus: 'GTY',
        joinedAt: new Date('2018-07-01'),
      },
    });
  }

  console.log('✓ Staff (kepegawaian) — KS + TU + 10 guru created');

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
  // TEACHING ASSIGNMENTS — agar Schedule bisa dibuat (FK dependency)
  // Dummy: 3 assignment untuk TKJ × kelas (guru4, guru5, guru6)
  // ═══════════════════════════════════════════════════════════════════════════

  // kelas[3] = X TKJ 1, kelas[4] = XI TKJ 1
  const taXTkj1 = await prisma.teachingAssignment.upsert({
    where: {
      teacherId_classId_subject_academicYear: {
        teacherId:    teachers[3]!.id,
        classId:      kelas[3]!.id,
        subject:      'Jaringan Komputer',
        academicYear: '2025/2026',
      },
    },
    update: {},
    create: {
      teacherId:    teachers[3]!.id,
      classId:      kelas[3]!.id,
      subject:      'Jaringan Komputer',
      hoursPerWeek: 4,
      academicYear: '2025/2026',
    },
  });

  const taXiTkj1 = await prisma.teachingAssignment.upsert({
    where: {
      teacherId_classId_subject_academicYear: {
        teacherId:    teachers[4]!.id,
        classId:      kelas[4]!.id,
        subject:      'Sistem Operasi',
        academicYear: '2025/2026',
      },
    },
    update: {},
    create: {
      teacherId:    teachers[4]!.id,
      classId:      kelas[4]!.id,
      subject:      'Sistem Operasi',
      hoursPerWeek: 2,
      academicYear: '2025/2026',
    },
  });

  const taXTkj1Web = await prisma.teachingAssignment.upsert({
    where: {
      teacherId_classId_subject_academicYear: {
        teacherId:    teachers[5]!.id,
        classId:      kelas[3]!.id,
        subject:      'Pemrograman Web',
        academicYear: '2025/2026',
      },
    },
    update: {},
    create: {
      teacherId:    teachers[5]!.id,
      classId:      kelas[3]!.id,
      subject:      'Pemrograman Web',
      hoursPerWeek: 4,
      academicYear: '2025/2026',
    },
  });

  console.log('✓ 3 TeachingAssignment dummy (TKJ) — created');

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULE — SMA-39 (data dummy; R-05: jangan data nyata)
  // JP = jam pelajaran ke-N (bukan jam dinding); mapping JP→jam = config sekolah
  // ═══════════════════════════════════════════════════════════════════════════

  const scheduleData = [
    // X TKJ 1 — Senin JP 1–2: Jaringan Komputer (Lab TKJ)
    {
      id:                   'cccccccc-0039-0000-0000-000000000001',
      classId:              kelas[3]!.id,
      teachingAssignmentId: taXTkj1.id,
      dayOfWeek:            1,   // Senin
      jpStart:              1,
      jpEnd:                2,
      room:                 'Lab TKJ',
      academicYear:         '2025/2026',
      semester:             1,
    },
    // X TKJ 1 — Rabu JP 3–6: Pemrograman Web (Lab Komputer)
    {
      id:                   'cccccccc-0039-0000-0000-000000000002',
      classId:              kelas[3]!.id,
      teachingAssignmentId: taXTkj1Web.id,
      dayOfWeek:            3,   // Rabu
      jpStart:              3,
      jpEnd:                6,
      room:                 'Lab Komputer',
      academicYear:         '2025/2026',
      semester:             1,
    },
    // XI TKJ 1 — Selasa JP 1–2: Sistem Operasi (Kelas XI-B)
    {
      id:                   'cccccccc-0039-0000-0000-000000000003',
      classId:              kelas[4]!.id,
      teachingAssignmentId: taXiTkj1.id,
      dayOfWeek:            2,   // Selasa
      jpStart:              1,
      jpEnd:                2,
      room:                 'Kelas XI-B',
      academicYear:         '2025/2026',
      semester:             1,
    },
    // X TKJ 1 — Jumat JP 1–2: Jaringan Komputer tanpa ruang (sekolah kecil)
    {
      id:                   'cccccccc-0039-0000-0000-000000000004',
      classId:              kelas[3]!.id,
      teachingAssignmentId: taXTkj1.id,
      dayOfWeek:            5,   // Jumat
      jpStart:              1,
      jpEnd:                2,
      room:                 null,  // nullable — sekolah belum assign ruang
      academicYear:         '2025/2026',
      semester:             1,
    },
  ];

  for (const s of scheduleData) {
    await prisma.schedule.upsert({
      where: { id: s.id },
      update: {},
      create: s,
    });
  }

  console.log('✓ 4 Schedule dummy (TKJ, TA 2025/2026, Sem 1) — created');

  // ═══════════════════════════════════════════════════════════════════════════
  // AI KNOWLEDGE — RAG CHUNKS (N-2: menggantikan knowledgeDocument)
  // Embedding dikosongkan di seed — akan diisi oleh SMA-44 saat ingest dokumen
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Chunk 1 (existing): Kurikulum ─────────────────────────────────────────
  await prisma.ragChunk.upsert({
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

  // ── SMA-44 FAQ chunks (embedding = NULL, diisi SMA-45) ────────────────────
  const faqChunks = [
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000001',
      title: 'Cara Pendaftaran Siswa Baru (PPDB)',
      content:
        'Pendaftaran siswa baru (PPDB) dapat dilakukan secara online melalui portal ' +
        'sekolah maupun langsung di kantor Tata Usaha. Calon siswa wajib melampirkan: ' +
        'fotokopi ijazah/STTB SMP sederajat, akta kelahiran, kartu keluarga, dan ' +
        'pas foto terbaru. Formulir pendaftaran tersedia gratis. Kuota per kelas ' +
        'adalah 36 siswa. Daftar lebih awal untuk mendapat prioritas seleksi.',
      source: 'faq-ppdb',
      category: 'faq',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000002',
      title: 'Jadwal dan Periode Pendaftaran PPDB',
      content:
        'Penerimaan Peserta Didik Baru (PPDB) dibuka setiap tahun mulai bulan Mei ' +
        'hingga Juli sebelum tahun ajaran baru dimulai. Tahun ajaran baru dimulai ' +
        'pada pertengahan Juli. Pengumuman hasil seleksi disampaikan melalui portal ' +
        'online dan papan pengumuman sekolah. Daftar ulang bagi yang diterima ' +
        'dilakukan dalam 3 hari kerja setelah pengumuman.',
      source: 'faq-ppdb',
      category: 'faq',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000003',
      title: 'Informasi Biaya SPP dan Pembayaran',
      content:
        'SPP (Sumbangan Pembinaan Pendidikan) dibayarkan setiap bulan paling lambat ' +
        'tanggal 10. Pembayaran dapat dilakukan melalui Tata Usaha sekolah atau ' +
        'transfer ke rekening resmi sekolah. Siswa yang mengalami kesulitan ekonomi ' +
        'dapat mengajukan keringanan melalui surat permohonan yang disetujui oleh ' +
        'Kepala Sekolah. Keterlambatan pembayaran tidak menghalangi proses belajar ' +
        'mengajar namun wajib diselesaikan sebelum ujian semester.',
      source: 'faq-keuangan',
      category: 'faq',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000004',
      title: 'Program Beasiswa dan Bantuan Pendidikan',
      content:
        'Sekolah menyediakan informasi dan pendampingan pengajuan beasiswa dari ' +
        'berbagai sumber: KIP (Kartu Indonesia Pintar), beasiswa prestasi akademik, ' +
        'dan beasiswa dari mitra industri. Siswa yang ingin mengajukan beasiswa ' +
        'dapat menghubungi bagian Tata Usaha untuk panduan persyaratan. Beasiswa ' +
        'KIP diproses setiap awal tahun ajaran bagi siswa yang memenuhi syarat.',
      source: 'faq-keuangan',
      category: 'faq',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000005',
      title: 'Jurusan TKJ — Teknik Komputer dan Jaringan',
      content:
        'Program Keahlian Teknik Komputer dan Jaringan (TKJ) mempersiapkan siswa ' +
        'menjadi teknisi jaringan komputer, administrator sistem, dan teknisi ' +
        'perangkat keras. Materi meliputi: instalasi dan konfigurasi jaringan, ' +
        'administrasi server Linux/Windows, keamanan jaringan, dan pemrograman web. ' +
        'Lulusan TKJ berpeluang kerja di perusahaan IT, ISP, instansi pemerintah, ' +
        'atau berwirausaha di bidang jasa komputer dan jaringan.',
      source: 'info-jurusan',
      category: 'jurusan',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000006',
      title: 'Jurusan AKL — Akuntansi dan Keuangan Lembaga',
      content:
        'Program Keahlian Akuntansi dan Keuangan Lembaga (AKL) membekali siswa ' +
        'dengan kemampuan pembukuan, pengolahan data keuangan, perpajakan, dan ' +
        'perbankan dasar. Siswa belajar menggunakan software akuntansi seperti ' +
        'Accurate dan MYOB. Lulusan AKL dapat bekerja sebagai staf keuangan, ' +
        'kasir, asisten akuntan di perusahaan swasta, BUMN, koperasi, atau ' +
        'melanjutkan studi ke perguruan tinggi jurusan akuntansi/manajemen.',
      source: 'info-jurusan',
      category: 'jurusan',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000007',
      title: 'Jurusan TKRO — Teknik Kendaraan Ringan Otomotif',
      content:
        'Program Keahlian Teknik Kendaraan Ringan Otomotif (TKRO) mencetak teknisi ' +
        'otomotif yang kompeten dalam perawatan dan perbaikan kendaraan roda empat. ' +
        'Materi mencakup: mesin bensin dan diesel, sistem kelistrikan kendaraan, ' +
        'transmisi dan chasis, serta tune-up dan overhaul. Praktik dilaksanakan di ' +
        'bengkel sekolah yang dilengkapi peralatan standar industri. Lulusan TKRO ' +
        'dapat bekerja di bengkel resmi, dealer mobil, atau membuka usaha sendiri.',
      source: 'info-jurusan',
      category: 'jurusan',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000008',
      title: 'Peraturan Seragam dan Atribut Sekolah',
      content:
        'Siswa wajib mengenakan seragam sesuai ketentuan: seragam putih-abu (Senin-' +
        'Selasa), seragam batik sekolah (Rabu-Kamis), dan seragam olahraga/praktek ' +
        'sesuai jadwal (Jumat). Atribut wajib: dasi, badge nama, dan badge sekolah. ' +
        'Sepatu hitam polos dan kaos kaki putih. Rambut rapi tidak diwarnai. ' +
        'Pelanggaran seragam berulang dicatat di buku pembinaan dan orang tua ' +
        'akan dihubungi.',
      source: 'tata-tertib',
      category: 'peraturan',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000009',
      title: 'Peraturan Kehadiran dan Prosedur Izin',
      content:
        'Kehadiran minimal 80% dari total hari efektif per semester wajib dipenuhi ' +
        'untuk dapat mengikuti ujian semester. Siswa yang tidak hadir wajib ' +
        'memberikan surat izin: sakit disertai surat dokter, keperluan keluarga ' +
        'disertai surat orang tua. Izin disampaikan paling lambat hari pertama ' +
        'ketidakhadiran melalui wali kelas. Siswa terlambat lebih dari 15 menit ' +
        'dianggap tidak hadir pada jam pertama.',
      source: 'tata-tertib',
      category: 'peraturan',
    },
    {
      id: 'bbbbbbbb-0044-0000-0000-000000000010',
      title: 'Praktik Kerja Lapangan (PKL/Prakerin)',
      content:
        'Praktik Kerja Lapangan (PKL) atau Prakerin dilaksanakan selama 3-6 bulan ' +
        'pada semester 5 (kelas XII) sesuai program keahlian masing-masing. Sekolah ' +
        'memfasilitasi penempatan PKL di perusahaan/instansi mitra yang telah ' +
        'bekerjasama. Siswa dapat juga mengajukan tempat PKL sendiri dengan ' +
        'persetujuan sekolah. Selama PKL, siswa dibimbing oleh instruktur lapangan ' +
        'dan guru pembimbing dari sekolah.',
      source: 'faq-akademik',
      category: 'faq',
    },
  ] as const;

  for (const chunk of faqChunks) {
    await prisma.ragChunk.upsert({
      where: { id: chunk.id },
      update: {},
      create: { ...chunk, isActive: true },
    });
  }

  console.log(`✓ AI Knowledge RAG chunks — 1 curriculum + ${faqChunks.length} FAQ/jurusan/peraturan\n`);

  // ── Ringkasan ─────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('🎉 Seed completed! SMK Darussalam Subah data:');
  console.log('   Users    : 4 staff + 10 guru + 20 siswa + 5 ortu + 1 industri = 40');
  console.log('   Kelas    : AKL(3) + TKJ(3) + TKRO(3) + TBSM(1) = 10');
  console.log('   Leads    : 5 (new→contacted→interested→registered→paid)');
  console.log('   Schedules: 4 dummy (TKJ, TA 2025/2026, Sem 1)');
  console.log('   RAG      : 11 chunks (1 curriculum + 4 faq + 3 jurusan + 2 peraturan + 1 faq-akademik)');
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
