/**
 * seed-demo-staging.ts — DATA DEMO LENGKAP untuk STAGING (uji Dasbor Eksekutif 2N).
 *
 * seed.ts hanya membuat users/kelas/siswa/3 teaching-assignment/sebagian PPDB —
 * TANPA nilai, SPP, RPP, atau absensi → panel Dasbor Eksekutif kosong.
 * Skrip ini melengkapi (idempotent, aman dijalankan ulang):
 *   - Attendance siswa 14 hari (deterministik; sebagian siswa alpha kronis → "Siswa Berisiko").
 *   - TeacherAttendance hari ini (~85% guru).
 *   - Grades: teaching-assignment per (kelas × mapel) + nilai per siswa (varian per jurusan).
 *   - SppPayment: beberapa bulan, status paid/unpaid/late → kolektibilitas + aging.
 *   - Rpp: per guru, status campuran (approved/submitted/revision/draft) → approval rate.
 *   - PpdbLead: variasi status → funnel PPDB.
 *
 * ⚠️ HANYA STAGING (DATABASE_URL mengandung 'staging'). Guard di bawah menolak DB lain.
 *
 * Run (di container staging):
 *   docker exec smk-staging-api sh -c 'cd /app/packages/database && \
 *     /app/node_modules/.bin/ts-node --transpile-only prisma/seed-demo-staging.ts'
 */

import {
  PrismaClient, AttendanceStatus, GradeType, PaymentStatus, RppStatus, LeadStatus, LeadSource,
} from '@prisma/client';

const prisma = new PrismaClient();
const ATT_DAYS = 14;
const SUBJECTS = ['Matematika', 'B.Indonesia', 'B.Inggris', 'Produktif'];
const GRADE_TYPES: GradeType[] = [GradeType.uts, GradeType.uh, GradeType.uas, GradeType.praktik];

function utcDate(daysAgo: number): Date {
  const d = new Date();
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  u.setUTCDate(u.getUTCDate() - daysAgo);
  return u;
}

/** Status absensi deterministik; siswa idx%13==0 dibuat alpha kronis (≥3/30hr). */
function statusFor(idx: number, day: number): AttendanceStatus {
  if (idx % 13 === 0 && day < 5) return AttendanceStatus.alpha;
  const s = idx * 10 + day;
  if (s % 17 === 0) return AttendanceStatus.alpha;
  if (s % 7 === 0) return AttendanceStatus.sakit;
  if (s % 11 === 0) return AttendanceStatus.izin;
  return AttendanceStatus.hadir;
}

const NOTE: Record<AttendanceStatus, string | null> = {
  hadir: null, izin: 'Izin keperluan keluarga', sakit: 'Sakit (demam)', alpha: 'Tanpa keterangan',
};

/** Nilai deterministik 40–98, bervariasi per jurusan & mapel (untuk box-plot/KKM/korelasi). */
function scoreFor(majorCode: string, subject: string, idx: number, typeIdx: number): number {
  const base: Record<string, number> = { TJKT: 83, TKJ: 81, AKL: 80, TKRO: 74, TBSM: 72 };
  const b = base[majorCode] ?? 77;
  const subjAdj = subject.startsWith('Mate') ? -7 : subject.startsWith('Produktif') ? 8 : subject.startsWith('B.Ing') ? -2 : 1;
  const wobble = ((idx * 7 + typeIdx * 5) % 23) - 11; // -11..11
  return Math.max(40, Math.min(98, b + subjAdj + wobble));
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/staging/i.test(url)) {
    console.error(`❌ ABORT: DATABASE_URL bukan staging (${url.slice(0, 40)}…). Skrip ini STAGING-only.`);
    process.exit(1);
  }
  console.log('🌱 Seed DEMO LENGKAP (STAGING)…');

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });
  const teachers = await prisma.teacher.findMany({ select: { id: true, userId: true } });
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, majorCode: true, academicYear: true, students: { select: { id: true } } },
  });
  if (!admin || teachers.length === 0 || classes.length === 0) {
    console.log('⚠️  Butuh admin + guru + kelas (jalankan seed.ts dulu). Skip.');
    return;
  }

  // Periode aktif (cocokkan dgn resolvePeriod Dasbor Eksekutif).
  const sem = await prisma.semester.findFirst({ where: { isActive: true }, include: { academicYear: true } });
  const now = new Date();
  const academicYear = sem?.academicYear.code ?? (now.getUTCMonth() >= 6 ? `${now.getUTCFullYear()}/${now.getUTCFullYear() + 1}` : `${now.getUTCFullYear() - 1}/${now.getUTCFullYear()}`);
  const semester = sem?.number ?? 1;
  console.log(`   Periode: TA ${academicYear} semester ${semester}`);

  // ── 1. Attendance siswa (14 hari) ──────────────────────────────────────────
  const attRows: { studentId: string; classId: string; date: Date; status: AttendanceStatus; notes: string | null; recordedBy: string }[] = [];
  classes.forEach((c) => {
    c.students.forEach((st, i) => {
      for (let j = 0; j < ATT_DAYS; j++) {
        const status = statusFor(i, j);
        attRows.push({ studentId: st.id, classId: c.id, date: utcDate(j), status, notes: NOTE[status], recordedBy: admin.id });
      }
    });
  });
  const att = await prisma.attendance.createMany({ data: attRows, skipDuplicates: true });
  console.log(`✓ Attendance: +${att.count} (dari ${attRows.length})`);

  // ── 2. Presensi guru hari ini (~85%) ───────────────────────────────────────
  const tRows = teachers.filter((_, i) => i % 7 !== 0).map((t) => ({ teacherId: t.id, date: utcDate(0), checkInAt: new Date(), outsideGeofence: false }));
  const tAtt = await prisma.teacherAttendance.createMany({ data: tRows, skipDuplicates: true });
  console.log(`✓ Presensi guru hari ini: +${tAtt.count} (dari ${tRows.length})`);

  // ── 3. Grades (per kelas × mapel) ──────────────────────────────────────────
  if ((await prisma.grade.count()) > 0) {
    console.log('• Grades sudah ada → skip.');
  } else {
    let assignmentCount = 0;
    const gradeRows: { studentId: string; assignmentId: string; semester: number; academicYear: string; score: number; type: GradeType; submittedBy: string }[] = [];
    for (let ci = 0; ci < classes.length; ci++) {
      const c = classes[ci]!;
      if (c.students.length === 0) continue;
      for (let si = 0; si < SUBJECTS.length; si++) {
        const subject = SUBJECTS[si]!;
        const teacher = teachers[(ci + si) % teachers.length]!;
        const ta = await prisma.teachingAssignment.upsert({
          where: { teacherId_classId_subject_academicYear: { teacherId: teacher.id, classId: c.id, subject, academicYear: c.academicYear } },
          update: {},
          create: { teacherId: teacher.id, classId: c.id, subject, hoursPerWeek: 2, academicYear: c.academicYear },
          select: { id: true },
        });
        assignmentCount++;
        c.students.forEach((st, i) => {
          GRADE_TYPES.forEach((type, ti) => {
            gradeRows.push({ studentId: st.id, assignmentId: ta.id, semester, academicYear, score: scoreFor(c.majorCode, subject, i, ti), type, submittedBy: teacher.userId });
          });
        });
      }
    }
    const g = await prisma.grade.createMany({ data: gradeRows, skipDuplicates: true });
    console.log(`✓ Grades: +${g.count} (assignment dipakai: ${assignmentCount})`);
  }

  // ── 4. SppPayment (4 bulan, status campuran) ───────────────────────────────
  const allStudents = classes.flatMap((c) => c.students.map((s) => s.id));
  const sppRows: { studentId: string; month: number; year: number; amount: number; status: PaymentStatus; paidAt: Date | null }[] = [];
  for (let m = 0; m < 4; m++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const month = d.getUTCMonth() + 1;
    const year = d.getUTCFullYear();
    allStudents.forEach((sid, i) => {
      // bulan terlama lebih banyak nunggak → aging terisi
      const r = (i + m * 3) % 10;
      const status: PaymentStatus = r < 7 - m ? PaymentStatus.paid : r < 9 - Math.min(m, 1) ? PaymentStatus.unpaid : PaymentStatus.late;
      sppRows.push({ studentId: sid, month, year, amount: 250000, status, paidAt: status === PaymentStatus.paid ? d : null });
    });
  }
  const spp = await prisma.sppPayment.createMany({ data: sppRows, skipDuplicates: true });
  console.log(`✓ SPP: +${spp.count} (dari ${sppRows.length})`);

  // ── 5. Rpp (per guru, status campuran) ─────────────────────────────────────
  if ((await prisma.rpp.count()) > 0) {
    console.log('• RPP sudah ada → skip.');
  } else {
    const RPP_STATUS: RppStatus[] = [RppStatus.approved, RppStatus.approved, RppStatus.submitted, RppStatus.revision, RppStatus.draft];
    const rppRows = teachers.flatMap((t, ti) =>
      [0, 1, 2].map((k) => {
        const status = RPP_STATUS[(ti + k) % RPP_STATUS.length]!;
        const subject = SUBJECTS[(ti + k) % SUBJECTS.length]!;
        return {
          teacherId: t.id, subject, title: `RPP ${subject} pertemuan ${k + 1}`, status, academicYear, semester,
          submittedAt: status === RppStatus.draft ? null : utcDate(7 + k),
          reviewedAt: status === RppStatus.approved || status === RppStatus.revision ? utcDate(3 + k) : null,
          reviewerName: status === RppStatus.approved || status === RppStatus.revision ? 'Kepala Sekolah' : null,
        };
      }),
    );
    const rpp = await prisma.rpp.createMany({ data: rppRows, skipDuplicates: true });
    console.log(`✓ RPP: +${rpp.count} (dari ${rppRows.length})`);
  }

  // ── 6. PpdbLead (funnel) ───────────────────────────────────────────────────
  if ((await prisma.ppdbLead.count()) >= 30) {
    console.log('• PPDB leads sudah cukup → skip.');
  } else {
    const DIST: { status: LeadStatus; n: number }[] = [
      { status: LeadStatus.new, n: 14 }, { status: LeadStatus.contacted, n: 10 }, { status: LeadStatus.interested, n: 8 },
      { status: LeadStatus.registered, n: 7 }, { status: LeadStatus.paid, n: 5 }, { status: LeadStatus.accepted, n: 12 },
      { status: LeadStatus.rejected, n: 3 }, { status: LeadStatus.cold, n: 4 },
    ];
    const MAJORS = ['TKRO', 'TBSM', 'TJKT', 'AKL'];
    const leadRows: { fullName: string; phone: string; status: LeadStatus; source: LeadSource; interestMajor: string; schoolOrigin: string }[] = [];
    let seq = 0;
    for (const d of DIST) {
      for (let k = 0; k < d.n; k++) {
        seq++;
        leadRows.push({
          fullName: `Calon Siswa ${seq}`,
          phone: `08${String(1000000000 + seq).slice(0, 10)}`,
          status: d.status,
          source: seq % 2 === 0 ? LeadSource.website : LeadSource.referral,
          interestMajor: MAJORS[seq % MAJORS.length]!,
          schoolOrigin: `SMP Negeri ${1 + (seq % 5)}`,
        });
      }
    }
    const leads = await prisma.ppdbLead.createMany({ data: leadRows, skipDuplicates: true });
    console.log(`✓ PPDB leads: +${leads.count} (dari ${leadRows.length})`);
  }

  console.log('🎉 Seed demo lengkap selesai.');
}

main()
  .catch((err) => { console.error('GAGAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
