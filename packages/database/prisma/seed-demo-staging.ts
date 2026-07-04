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

  // ── 7. Akun GURU testable (inspector) + Teacher + assignment ───────────────
  // Inspector dibuat bila belum ada (auth.users row mungkin hanya di prod) → dashboard
  // Akademik Guru bisa dites dgn login inspector (password lihat memory).
  const KC_INSPECTOR = 'af486cb9-84f7-4b19-9deb-63a2af4b4c2c';
  let inspector = await prisma.user.findFirst({
    where: { OR: [{ keycloakId: KC_INSPECTOR }, { email: 'inspector@smkdarussalamsubah.sch.id' }] },
    select: { id: true },
  });
  if (!inspector) {
    inspector = await prisma.user.create({
      data: { keycloakId: KC_INSPECTOR, email: 'inspector@smkdarussalamsubah.sch.id', fullName: 'Inspektur Demo', role: 'GURU', isActive: true },
      select: { id: true },
    });
    console.log('✓ Inspector auth.users dibuat (staging).');
  }
  let t = await prisma.teacher.findFirst({ where: { userId: inspector.id }, select: { id: true } });
  if (!t) t = await prisma.teacher.create({ data: { userId: inspector.id }, select: { id: true } });
  const someClasses = classes.slice(0, 2);
  const subs = ['Pemrograman Web', 'Basis Data', 'Matematika'];
  for (const c of someClasses) {
    for (const subj of subs) {
      await prisma.teachingAssignment.upsert({
        where: { teacherId_classId_subject_academicYear: { teacherId: t.id, classId: c.id, subject: subj, academicYear: c.academicYear } },
        update: {},
        create: { teacherId: t.id, classId: c.id, subject: subj, hoursPerWeek: 2, academicYear: c.academicYear },
      });
    }
  }
  console.log(`✓ Inspector → Teacher + assignment (kelas: ${someClasses.map((c) => c.name).join(', ')})`);

  // ── 8. Jadwal mingguan untuk SEMUA assignment yang belum punya jadwal ───────
  const existing = await prisma.schedule.findMany({
    select: { classId: true, dayOfWeek: true, jpStart: true, teachingAssignment: { select: { teacherId: true } } },
  });
  const usedClass = new Set<string>(existing.map((e) => `${e.classId}|${e.dayOfWeek}|${e.jpStart}`));
  const usedTeacher = new Set<string>(existing.map((e) => `${e.teachingAssignment.teacherId}|${e.dayOfWeek}|${e.jpStart}`));
  const tas = await prisma.teachingAssignment.findMany({
    select: { id: true, teacherId: true, classId: true, academicYear: true, schedules: { select: { id: true } } },
  });
  const toPlace = tas.filter((ta) => ta.schedules.length === 0);
  const BLOCKS: [number, number][] = [[1, 2], [4, 5], [7, 8], [3, 3], [6, 6]];
  const schedRows: { classId: string; teachingAssignmentId: string; dayOfWeek: number; jpStart: number; jpEnd: number; room: string; academicYear: string; semester: number }[] = [];
  for (const ta of toPlace) {
    let placed = false;
    for (let day = 1; day <= 6 && !placed; day++) {
      for (const [a, b] of BLOCKS) {
        const ck = `${ta.classId}|${day}|${a}`;
        const tk = `${ta.teacherId}|${day}|${a}`;
        if (usedClass.has(ck) || usedTeacher.has(tk)) continue;
        usedClass.add(ck); usedTeacher.add(tk);
        schedRows.push({ classId: ta.classId, teachingAssignmentId: ta.id, dayOfWeek: day, jpStart: a, jpEnd: b, room: 'Lab Komputer', academicYear: ta.academicYear, semester });
        placed = true; break;
      }
    }
  }
  const sc = schedRows.length ? await prisma.schedule.createMany({ data: schedRows, skipDuplicates: true }) : { count: 0 };
  console.log(`✓ Schedule: +${sc.count} (assignment tanpa jadwal: ${toPlace.length})`);

  // ── 9. LMS Modules (5 published per guru) ───────────────────────────────────
  if ((await prisma.lmsModule.count()) > 0) {
    console.log('• LMS Modules sudah ada → skip.');
  } else {
    const lmsRows = teachers.flatMap((t, ti) =>
      [0, 1, 2, 3, 4].map((k) => {
        const subject = SUBJECTS[(ti + k) % SUBJECTS.length]!;
        const ay = classes[0]?.academicYear ?? academicYear;
        return {
          teacherId: t.id,
          rppId: null,
          classId: classes[(ti + k) % classes.length]?.id ?? null,
          subject,
          title: `Modul ${subject} - Pertemuan ${k + 1}`,
          tp: `TP ${k + 1}: Memahami konsep ${subject}`,
          jpAllocation: 2,
          kktp: 75,
          content: `## Materi ${subject}\n\nPenjelasan materi ${subject} pertemuan ${k + 1}.`,
          orderIndex: k,
          status: k < 3 ? 'published' as const : k === 3 ? 'draft' as const : 'archived' as const,
          academicYear: ay,
          semester,
        };
      })
    );
    const lms = await prisma.lmsModule.createMany({ data: lmsRows, skipDuplicates: true });
    console.log(`✓ LMS Modules: +${lms.count} (published/draft/archived mix)`);
  }

  // ── 10. Badge Catalog + Student Badges ──────────────────────────────────────
  if ((await prisma.badge.count()) > 0) {
    console.log('• Badges sudah ada → skip.');
  } else {
    const badgeDefs = [
      { code: 'first_module', name: 'Pelajar Pertama', description: 'Menyelesaikan modul pertama', icon: '🎓', tier: 'bronze' as const, criteria: 'complete_first_module' },
      { code: 'perfect_score', name: 'Sempurna', description: 'Mendapat nilai 100', icon: '⭐', tier: 'gold' as const, criteria: 'score_100' },
      { code: 'streak_5', name: 'Konsisten 5 Hari', description: 'Hadir 5 hari beruntun', icon: '🔥', tier: 'silver' as const, criteria: 'streak_5' },
      { code: 'quiz_master', name: 'Jago Kuis', description: 'Menyelesaikan 10 kuis', icon: '🏆', tier: 'gold' as const, criteria: 'complete_10_quizzes' },
      { code: 'helpful', name: 'Suka Membantu', description: 'Aktif di forum diskusi', icon: '🤝', tier: 'bronze' as const, criteria: 'forum_active' },
      { code: 'fast_learner', name: 'Belajar Cepat', description: 'Selesai 3 modul dalam 1 minggu', icon: '⚡', tier: 'silver' as const, criteria: 'complete_3_modules_week' },
      { code: 'excellence', name: 'Unggulan', description: 'Rata-rata nilai ≥90', icon: '💎', tier: 'platinum' as const, criteria: 'avg_grade_90' },
      { code: 'attendance_pro', name: 'Rajin Hadir', description: 'Kehadiran 100% sebulan', icon: '📅', tier: 'gold' as const, criteria: 'attendance_100_month' },
    ];
    const bd = await prisma.badge.createMany({ data: badgeDefs, skipDuplicates: true });
    console.log(`✓ Badge definitions: +${bd.count}`);

    // Award 3 random badges per student
    const badgeIds = (await prisma.badge.findMany({ select: { id: true } })).map((b) => b.id);
    const allStudents = classes.flatMap((c) => c.students.map((s) => s.id));
    const studentBadgeRows: { badgeId: string; studentId: string; awardedBy: string | null }[] = [];
    allStudents.forEach((sid, i) => {
      for (let k = 0; k < 3; k++) {
        const bid = badgeIds[(i * 3 + k) % badgeIds.length]!;
        studentBadgeRows.push({ badgeId: bid, studentId: sid, awardedBy: admin.id });
      }
    });
    const sb = await prisma.studentBadge.createMany({ data: studentBadgeRows, skipDuplicates: true });
    console.log(`✓ Student Badges: +${sb.count} (3 per siswa)`);
  }

  // ── 11. Student XP ──────────────────────────────────────────────────────────
  if ((await prisma.studentXp.count()) > 0) {
    console.log('• Student XP sudah ada → skip.');
  } else {
    const allStudents = classes.flatMap((c) => c.students.map((s) => s.id));
    const xpRows = allStudents.map((sid, i) => ({
      studentId: sid,
      totalXp: 100 + (i % 20) * 100,
      level: 1 + Math.floor((i % 20) / 5),
      streakDays: i % 7,
    }));
    const xp = await prisma.studentXp.createMany({ data: xpRows, skipDuplicates: true });
    console.log(`✓ Student XP: +${xp.count}`);
  }

  // ── 12. Announcements (5 published) ─────────────────────────────────────────
  if ((await prisma.announcement.count()) >= 5) {
    console.log('• Announcements sudah cukup → skip.');
  } else {
    const annRows = [
      { title: 'Selamat Datang Tahun Ajaran Baru', content: 'Selamat datang siswa-siswi baru dan lama. Semoga tahun ini menjadi tahun yang produktif.', audience: JSON.stringify(['ALL']), priority: 'biasa' as const, status: 'published' as const, publishedAt: utcDate(7), createdBy: 'admin', createdByName: 'Administrator' },
      { title: 'Jadwal Ulangan Tengah Semester', content: 'UTS akan dilaksanakan minggu ke-8. Mohon siapkan diri dengan belajar tekun.', audience: JSON.stringify(['SISWA']), priority: 'penting' as const, status: 'published' as const, publishedAt: utcDate(5), createdBy: 'admin', createdByName: 'Administrator' },
      { title: 'Pertemuan Wali Murid', content: 'Pertemuan wali murid akan diadakan pada hari Sabtu pukul 09:00 di aula.', audience: JSON.stringify(['ORANG_TUA']), priority: 'biasa' as const, status: 'published' as const, publishedAt: utcDate(3), createdBy: 'admin', createdByName: 'Administrator' },
      { title: 'Ekstrakurikuler Pool 2026', content: 'Pendaftaran ekskul dibuka: Robotika, Futsal, English Club, Pramuka.', audience: JSON.stringify(['SISWA']), priority: 'biasa' as const, status: 'published' as const, publishedAt: utcDate(2), createdBy: 'admin', createdByName: 'Administrator' },
      { title: 'Libur Hari Raya', content: 'Libur Idul Fitri: tanggal 17-25. Kuliah dilanjutkan tanggal 26.', audience: JSON.stringify(['ALL']), priority: 'urgent' as const, status: 'published' as const, publishedAt: utcDate(1), createdBy: 'admin', createdByName: 'Administrator' },
    ];
    const ann = await prisma.announcement.createMany({ data: annRows, skipDuplicates: true });
    console.log(`✓ Announcements: +${ann.count} (5 published)`);
  }

  // ── 13. Class Activities (Jurnal) ───────────────────────────────────────────
  if ((await prisma.classActivity.count()) > 0) {
    console.log('• Class Activities sudah ada → skip.');
  } else {
    const actRows = teachers.flatMap((t, ti) =>
      [0, 1, 2, 3, 4].map((k) => {
        const c = classes[(ti + k) % classes.length]!;
        const subj = SUBJECTS[(ti + k) % SUBJECTS.length]!;
        return {
          classId: c.id,
          teacherId: t.id,
          date: utcDate(k + 1),
          title: `${subj} - Pertemuan ${k + 1}`,
          description: `Materi: ${subj} bab ${k + 1}. Metode: ceramah + praktik. Hasil: siswa paham konsep dasar.`,
          category: k % 3 === 0 ? 'pembelajaran' as const : k % 3 === 1 ? 'praktikum' as const : 'ulangan' as const,
        };
      })
    );
    const acts = await prisma.classActivity.createMany({ data: actRows, skipDuplicates: true });
    console.log(`✓ Class Activities: +${acts.count} (5 per guru)`);
  }

  // ── 14. Academic Calendar Events ────────────────────────────────────────────
  if ((await prisma.academicCalendar.count()) >= 5) {
    console.log('• Calendar Events sudah cukup → skip.');
  } else {
    const ay = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (ay) {
      const evRows = [
        { academicYearId: ay.id, name: 'Libur Semester Ganjil', startDate: new Date(`${academicYear.slice(0, 4)}-12-20`), endDate: new Date(`${academicYear.slice(0, 4)}-12-31`), type: 'holiday' as const, description: 'Libur akhir semester ganjil' },
        { academicYearId: ay.id, name: 'Ujian Tengah Semester', startDate: new Date(`${academicYear.slice(0, 4)}-10-15`), endDate: new Date(`${academicYear.slice(0, 4)}-10-20`), type: 'exam' as const, description: 'UTS semester ganjil' },
        { academicYearId: ay.id, name: 'Hari Pendidikan Nasional', startDate: new Date(`${academicYear.slice(0, 4)}-05-02`), endDate: new Date(`${academicYear.slice(0, 4)}-05-02`), type: 'event' as const, description: 'Peringatan Hardiknas' },
        { academicYearId: ay.id, name: 'Libur Musim Panas', startDate: new Date(`${academicYear.slice(5, 9)}-06-15`), endDate: new Date(`${academicYear.slice(5, 9)}-07-15`), type: 'break' as const, description: 'Libur antar semester' },
        { academicYearId: ay.id, name: 'Pentas Seni Sekolah', startDate: new Date(`${academicYear.slice(0, 4)}-11-25`), endDate: new Date(`${academicYear.slice(0, 4)}-11-25`), type: 'event' as const, description: 'Pentas seni tahunan' },
      ];
      const evs = await prisma.academicCalendar.createMany({ data: evRows, skipDuplicates: true });
      console.log(`✓ Calendar Events: +${evs.count}`);
    }
  }

  // ── 15. Notification Logs (WA) ──────────────────────────────────────────────
  if ((await prisma.notificationLog.count()) >= 10) {
    console.log('• Notification Logs sudah cukup → skip.');
  } else {
    const allStudents = classes.flatMap((c) => c.students);
    const logRows: { recipient: string; channel: string; subject: string | null; body: string; status: string; sentAt: Date; refType: string }[] = [];
    allStudents.slice(0, 15).forEach((st, i) => {
      const phone = `0812${String(3456000 + i).slice(0, 7)}`;
      const statuses = ['alpha', 'sakit', 'izin'] as const;
      const status = statuses[i % 3]!;
      logRows.push({
        recipient: phone,
        channel: 'whatsapp' as const,
        subject: `Notifikasi Kehadiran`,
        body: `Yth. Orang Tua/Wali, putra/putri Anda (${st.id}) hari ini tidak hadir dengan keterangan: ${status.toUpperCase()}. Mohon konfirmasi.`,
        status: 'sent' as const,
        sentAt: utcDate(i % 5),
        refType: 'student',
      });
    });
    const nls = await prisma.notificationLog.createMany({ data: logRows, skipDuplicates: true });
    console.log(`✓ Notification Logs (WA): +${nls.count}`);
  }

  // ── 16. KKTP Configs (3-5 per mapel) ────────────────────────────────────────
  if ((await prisma.kktpConfig.count()) > 0) {
    console.log('• KKTP Configs sudah ada → skip.');
  } else {
    const kktpRows = SUBJECTS.map((subj, i) => ({
      subject: subj,
      kktp: subj.startsWith('Mate') ? 70 : subj.startsWith('Produktif') ? 78 : 75,
      academicYear,
      semester,
      createdBy: admin.id,
    }));
    const kk = await prisma.kktpConfig.createMany({ data: kktpRows, skipDuplicates: true });
    console.log(`✓ KKTP Configs: +${kk.count} (per mapel)`);
  }

  console.log('🎉 Seed demo lengkap selesai.');
}

main()
  .catch((err) => { console.error('GAGAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
