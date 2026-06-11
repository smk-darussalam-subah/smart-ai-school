// =============================================================================
// NotificationListener — konsumer EventEmitter2 → NotificationService
//
// Guardrail (sprint-plan §5):
//   • Listener TIDAK kirim WA langsung — selalu via NotificationService.notify()
//   • Idempotensi (N-9): selalu sertakan refType+refId ke notify()
//     agar tidak dobel-kirim saat retry startup hook.
//   • N-10: payment.received hanya trigger notifikasi; TIDAK ada logika BOS
//     (TODO Tahap 2: update saldo BOS saat ada model BOS)
//   • Resolusi penerima: Student→parent(User).phone; bila null, notify()
//     tetap dipanggil — LogAdapter aman, FonnteAdapter fail-soft.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import {
  EVENTS,
  StudentEnrolledPayload,
  StudentStatusChangedPayload,
  GradeSubmittedPayload,
  AttendanceRecordedPayload,
  PaymentReceivedPayload,
  RppReviewedPayload,
  AnnouncementPublishedPayload,
  ReportDistributedPayload,
} from '../events/events.types';

@Injectable()
export class NotificationListener {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Resolve nomor WA dari auth.users.id → User.phone (nullable) */
  private async resolvePhone(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { phone: true },
    });
    return user?.phone ?? null;
  }

  /**
   * Resolve kontakabilitas siswa: student.userId → phone dan parentId → phone.
   * Bila tidak ditemukan, phone = null → notify() tetap dipanggil (fail-soft).
   */
  private async resolveStudentContacts(studentId: string): Promise<{
    studentUserId: string | null;
    studentPhone:  string | null;
    parentId:      string | null;
    parentPhone:   string | null;
    fullName:      string;
  }> {
    const student = await this.prisma.student.findUnique({
      where:  { id: studentId },
      select: {
        userId:   true,
        parentId: true,
        user:     { select: { phone: true, fullName: true } },
        parent:   { select: { phone: true } },
      },
    });
    return {
      studentUserId: student?.userId ?? null,
      studentPhone:  student?.user?.phone ?? null,
      parentId:      student?.parentId ?? null,
      parentPhone:   student?.parent?.phone ?? null,
      fullName:      student?.user?.fullName ?? 'Siswa',
    };
  }

  // ── Listeners ─────────────────────────────────────────────────────────────────

  /**
   * student.enrolled → WA selamat datang ke ORANG_TUA
   * refType: 'student', refId: studentId (idempotensi: satu welcome per siswa)
   */
  @OnEvent(EVENTS.STUDENT_ENROLLED)
  async handleStudentEnrolled(payload: StudentEnrolledPayload): Promise<void> {
    try {
      const parentPhone = payload.parentId
        ? await this.resolvePhone(payload.parentId)
        : null;

      await this.notificationService.notify({
        channel: 'whatsapp',
        to:      parentPhone ?? '',
        body:    `Selamat datang! Siswa ${payload.fullName} (NIS: ${payload.nis}) telah terdaftar di SMK Darussalam Subah. Informasi lebih lanjut dapat menghubungi Tata Usaha.`,
        refType: 'student',
        refId:   payload.studentId,
      });
    } catch (err: unknown) {
      logger.warn('[NotificationListener] handleStudentEnrolled error', {
        studentId: payload.studentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * student.statusChanged → WA ke siswa + OT
   * refType: 'student', refId: `${studentId}:status:${newStatus}` untuk idempotensi per transisi
   */
  @OnEvent(EVENTS.STUDENT_STATUS_CHANGED)
  async handleStudentStatusChanged(payload: StudentStatusChangedPayload): Promise<void> {
    try {
      const [studentPhone, parentPhone] = await Promise.all([
        this.resolvePhone(payload.userId),
        payload.parentId ? this.resolvePhone(payload.parentId) : Promise.resolve(null),
      ]);

      const body = `Status siswa ${payload.fullName} (NIS: ${payload.nis}) telah berubah dari ${payload.oldStatus} menjadi ${payload.newStatus}.`;
      const refId = `${payload.studentId}:status:${payload.newStatus}`;

      const notifies: Promise<void>[] = [];

      if (studentPhone !== null || payload.userId) {
        notifies.push(
          this.notificationService.notify({
            channel: 'whatsapp',
            to:      studentPhone ?? '',
            body,
            refType: 'student',
            refId,
          }),
        );
      }

      if (parentPhone !== null || payload.parentId) {
        notifies.push(
          this.notificationService.notify({
            channel: 'whatsapp',
            to:      parentPhone ?? '',
            body,
            refType: 'student',
            refId:   `${refId}:ortu`,
          }),
        );
      }

      await Promise.all(notifies);
    } catch (err: unknown) {
      logger.warn('[NotificationListener] handleStudentStatusChanged error', {
        studentId: payload.studentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * grade.submitted → notif ringkasan nilai ke OT
   * refType: 'grade', refId: gradeId (idempotensi: satu notif per grade entry)
   */
  @OnEvent(EVENTS.GRADE_SUBMITTED)
  async handleGradeSubmitted(payload: GradeSubmittedPayload): Promise<void> {
    try {
      const { parentPhone } = await this.resolveStudentContacts(payload.studentId);

      await this.notificationService.notify({
        channel: 'whatsapp',
        to:      parentPhone ?? '',
        body:    `Nilai ${payload.type.toUpperCase()} ${payload.subject} semester ${payload.semester} (${payload.academicYear}): ${payload.score}. Informasi detail tersedia di portal siswa.`,
        refType: 'grade',
        refId:   payload.gradeId,
      });
    } catch (err: unknown) {
      logger.warn('[NotificationListener] handleGradeSubmitted error', {
        gradeId: payload.gradeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * attendance.recorded (hanya alpha/sakit) → WA hari itu ke OT
   * refType: 'attendance', refId: attendanceId
   */
  @OnEvent(EVENTS.ATTENDANCE_RECORDED)
  async handleAttendanceRecorded(payload: AttendanceRecordedPayload): Promise<void> {
    try {
      const { parentPhone, fullName } = await this.resolveStudentContacts(payload.studentId);

      const statusLabel = payload.status === 'alpha' ? 'tidak hadir (alpha)' : 'sakit';
      await this.notificationService.notify({
        channel: 'whatsapp',
        to:      parentPhone ?? '',
        body:    `Pemberitahuan absensi: ${fullName} pada ${payload.date} tercatat ${statusLabel}. Harap konfirmasi ke sekolah jika ada keperluan.`,
        refType: 'attendance',
        refId:   payload.attendanceId,
      });
    } catch (err: unknown) {
      logger.warn('[NotificationListener] handleAttendanceRecorded error', {
        attendanceId: payload.attendanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * payment.received → kwitansi digital ke siswa + OT
   * refType: 'payment', refId: paymentId
   *
   * N-10: TIDAK ada logika update saldo BOS di sini.
   * TODO Tahap 2: tambah konsumer BOS saat model BOS tersedia.
   */
  @OnEvent(EVENTS.PAYMENT_RECEIVED)
  async handlePaymentReceived(payload: PaymentReceivedPayload): Promise<void> {
    try {
      const { studentPhone, parentPhone, fullName } = await this.resolveStudentContacts(payload.studentId);

      const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const monthLabel = monthNames[payload.month] ?? `Bulan-${payload.month}`;
      const receiptInfo = payload.receiptNo ? ` No. kwitansi: ${payload.receiptNo}.` : '';
      const body = `Pembayaran SPP ${monthLabel} ${payload.year} sebesar Rp ${Number(payload.amount).toLocaleString('id-ID')} untuk ${fullName} telah diterima.${receiptInfo}`;

      const notifies: Promise<void>[] = [];

      // Notif ke siswa
      notifies.push(
        this.notificationService.notify({
          channel: 'whatsapp',
          to:      studentPhone ?? '',
          body,
          refType: 'payment',
          refId:   payload.paymentId,
        }),
      );

      // Notif ke OT (refId berbeda agar idempotensi per penerima)
      if (parentPhone !== null || payload.studentId) {
        notifies.push(
          this.notificationService.notify({
            channel: 'whatsapp',
            to:      parentPhone ?? '',
            body,
            refType: 'payment',
            refId:   `${payload.paymentId}:ortu`,
          }),
        );
      }

      await Promise.all(notifies);
    } catch (err: unknown) {
      logger.warn('[NotificationListener] handlePaymentReceived error', {
        paymentId: payload.paymentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * rpp.reviewed → WA ke guru pemilik RPP.
   * refId memuat reviewedAtIso → idempoten per AKSI review (re-review setelah
   * resubmit tetap terkirim; retry event yang sama tidak dobel).
   */
  @OnEvent(EVENTS.RPP_REVIEWED)
  async onRppReviewed(payload: RppReviewedPayload): Promise<void> {
    try {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: payload.teacherId },
        select: { user: { select: { phone: true, fullName: true } } },
      });
      const phone = teacher?.user?.phone ?? null;
      if (!phone) {
        logger.warn('[NotificationListener] rpp.reviewed: guru tanpa nomor WA', {
          rppId: payload.rppId,
        });
        return;
      }
      const verdict =
        payload.decision === 'approved'
          ? 'DISETUJUI ✅'
          : `PERLU REVISI ↩\nCatatan: ${payload.note ?? '-'}`;
      await this.notificationService.notify({
        channel: 'whatsapp',
        to: phone,
        body:
          `Halo ${teacher?.user?.fullName ?? 'Bapak/Ibu Guru'}, hasil review RPP ` +
          `"${payload.title}": ${verdict}\n— DIIS SMK Darussalam Subah`,
        refType: 'rpp-review',
        refId: `${payload.rppId}:${payload.reviewedAtIso}`,
      });
    } catch (err) {
      logger.error('[NotificationListener] rpp.reviewed gagal (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * announcement.published → broadcast WA HANYA untuk kategori darurat ATAU
   * prioritas urgent (kontrol volume; pengumuman biasa cukup in-app).
   * Penerima: users aktif ber-phone sesuai audiens. Idempoten per
   * (announcementId, penerima) via refType+refId+to.
   */
  @OnEvent(EVENTS.ANNOUNCEMENT_PUBLISHED)
  async onAnnouncementPublished(payload: AnnouncementPublishedPayload): Promise<void> {
    try {
      if (payload.category !== 'darurat' && payload.priority !== 'urgent') return;

      const isAll = payload.audience.includes('ALL');
      const recipients = await this.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          phone: { not: null },
          ...(isAll ? {} : { role: { in: payload.audience as never } }),
        },
        select: { phone: true },
      });
      if (recipients.length === 0) return;

      const body =
        `📢 PENGUMUMAN ${payload.category === 'darurat' ? 'DARURAT' : 'PENTING'}: ` +
        `${payload.title}\nBuka DIIS untuk detail.\n— SMK Darussalam Subah`;

      // notify() per penerima — antrian BullMQ yang mengatur rate-limit/retry
      for (const r of recipients) {
        if (!r.phone) continue;
        await this.notificationService.notify({
          channel: 'whatsapp',
          to: r.phone,
          body,
          refType: 'announcement',
          refId: payload.announcementId,
        });
      }
      logger.info('[NotificationListener] broadcast pengumuman dienqueue', {
        announcementId: payload.announcementId,
        recipients: recipients.length,
      });
    } catch (err) {
      logger.error('[NotificationListener] announcement.published gagal (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * report.distributed → WA ke ORANG TUA siswa (rapor sudah bisa dilihat).
   * Idempoten per rapor via refType+refId.
   */
  @OnEvent(EVENTS.REPORT_DISTRIBUTED)
  async onReportDistributed(payload: ReportDistributedPayload): Promise<void> {
    try {
      const c = await this.resolveStudentContacts(payload.studentId);
      if (!c.parentPhone) {
        logger.warn('[NotificationListener] report.distributed: ortu tanpa nomor WA', {
          reportCardId: payload.reportCardId,
        });
        return;
      }
      await this.notificationService.notify({
        channel: 'whatsapp',
        to: c.parentPhone,
        body:
          `Yth. Orang Tua/Wali ${c.fullName}, rapor ${payload.academicYear} ` +
          `Semester ${payload.semester} ananda telah DIBAGIKAN dan dapat dilihat ` +
          `di DIIS.\n— SMK Darussalam Subah`,
        refType: 'report-card',
        refId: payload.reportCardId,
      });
    } catch (err) {
      logger.error('[NotificationListener] report.distributed gagal (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
