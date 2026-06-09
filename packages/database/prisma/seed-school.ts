import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ['error'],
});

async function main() {
  console.log('🏫 Seeding School Config...\n');

  const schoolProfile = await prisma.schoolProfile.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'SMK Darussalam Subah',
      npsn: '20324567',
      address: 'Jl. Raya Subah No. 123, Kec. Subah, Kab. Batang, Jawa Tengah 51262',
      phone: '(0285) 123456',
      email: 'info@smkdarussalamsubah.sch.id',
      website: 'https://smkdarussalamsubah.sch.id',
      headmasterName: 'Drs. H. Abdul Karim, M.Pd',
      headmasterNip: '196501011990031008',
      accreditation: 'A',
    },
  });
  console.log(`  ✅ School Profile: ${schoolProfile.name}`);

  // ── Majors (4 jurusan) ─────────────────────────────────────────────────
  const majors = [
    { code: 'TKRO', name: 'Teknik Kendaraan Ringan Otomotif', description: 'Kompetensi keahlian perawatan dan perbaikan kendaraan ringan' },
    { code: 'TBSM', name: 'Teknik dan Bisnis Sepeda Motor', description: 'Kompetensi keahlian perawatan dan perbaikan sepeda motor' },
    { code: 'AKL', name: 'Akuntansi dan Keuangan Lembaga', description: 'Kompetensi keahlian akuntansi dan pengelolaan keuangan' },
    { code: 'TJKT', name: 'Teknik Jaringan Komputer dan Telekomunikasi', description: 'Kompetensi keahlian jaringan komputer dan telekomunikasi' },
  ];

  for (const m of majors) {
    await prisma.major.upsert({
      where: { code: m.code },
      update: { name: m.name, description: m.description },
      create: m,
    });
    console.log(`  ✅ Major: ${m.code} — ${m.name}`);
  }

  // ── Academic Years ─────────────────────────────────────────────────────
  const ay2025 = await prisma.academicYear.upsert({
    where: { code: '2025/2026' },
    update: {},
    create: {
      code: '2025/2026',
      startDate: new Date('2025-07-14'),
      endDate: new Date('2026-06-27'),
      isActive: false,
    },
  });

  const ay2026 = await prisma.academicYear.upsert({
    where: { code: '2026/2027' },
    update: {},
    create: {
      code: '2026/2027',
      startDate: new Date('2026-07-13'),
      endDate: new Date('2027-06-26'),
      isActive: true,
    },
  });
  console.log(`  ✅ Academic Years: 2025/2026 (archived), 2026/2027 (active)`);

  // ── Semesters ───────────────────────────────────────────────────────────
  const semesters = [
    { academicYearId: ay2025.id, number: 1, startDate: new Date('2025-07-14'), endDate: new Date('2025-12-20'), isActive: false },
    { academicYearId: ay2025.id, number: 2, startDate: new Date('2026-01-05'), endDate: new Date('2026-06-27'), isActive: false },
    { academicYearId: ay2026.id, number: 1, startDate: new Date('2026-07-13'), endDate: new Date('2026-12-19'), isActive: true },
    { academicYearId: ay2026.id, number: 2, startDate: new Date('2027-01-04'), endDate: new Date('2027-06-26'), isActive: false },
  ];

  for (const s of semesters) {
    await prisma.semester.create({
      data: s,
    });
  }
  console.log(`  ✅ Semesters: 2 per academic year (2026/2027 semester 1 active)`);

  // ── Academic Calendar (2026/2027) ──────────────────────────────────────
  const events = [
    { name: 'Hari Pertama Masuk Sekolah', startDate: new Date('2026-07-13'), endDate: new Date('2026-07-13'), type: 'event' as const },
    { name: 'Masa Pengenalan Lingkungan Sekolah (MPLS)', startDate: new Date('2026-07-13'), endDate: new Date('2026-07-18'), type: 'event' as const },
    { name: 'Hari Kemerdekaan RI', startDate: new Date('2026-08-17'), endDate: new Date('2026-08-17'), type: 'holiday' as const },
    { name: 'UTS Semester 1', startDate: new Date('2026-09-28'), endDate: new Date('2026-10-03'), type: 'exam' as const },
    { name: 'Libur Semester 1', startDate: new Date('2026-12-21'), endDate: new Date('2027-01-02'), type: 'break' as const },
    { name: 'Hari Pertama Semester 2', startDate: new Date('2027-01-04'), endDate: new Date('2027-01-04'), type: 'event' as const },
    { name: 'UAS Semester 2', startDate: new Date('2027-06-07'), endDate: new Date('2027-06-19'), type: 'exam' as const },
    { name: 'Libur Akhir Tahun Ajaran', startDate: new Date('2027-06-28'), endDate: new Date('2027-07-10'), type: 'break' as const },
  ];

  for (const e of events) {
    await prisma.academicCalendar.create({
      data: { ...e, academicYearId: ay2026.id },
    });
  }
  console.log(`  ✅ Academic Calendar: ${events.length} events untuk 2026/2027`);

  console.log('\n✅ Seed school config selesai');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
