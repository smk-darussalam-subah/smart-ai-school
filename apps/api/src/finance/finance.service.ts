// =============================================================================
// FinanceService — SPP payment recording + approval
//
// RBAC (service layer, pola Grade/Attendance):
//   POST record:  SA, TU. recordedBy = auth.users.id.
//                 P2002 (@@unique [studentId,month,year]) → propagate ke
//                 PrismaExceptionFilter global → 409. Jangan try/catch P2002.
//   GET list:     SA/KS/TU semua; SISWA self; ORANG_TUA anak.
//   GET summary:  SA/KS/TU — aggregate per year/month/status.
//   GET history:  SA/TU semua; SISWA self-only; ORANG_TUA anak-only.
//   POST approve: SA/KS only (BUKAN TU — separation of duties).
//                 Sudah approved → ConflictException 409.
//
// Semua audit field = auth.users.id (konsisten dengan Grade/Attendance).
// TODO: emit event payment.received → NotificationService (SMA-43)
// =============================================================================

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotifChannel, PaymentStatus, Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveSiswaId } from '../common/helpers/role-helpers';
import { normalizePhoneE164 } from '../common/helpers/phone';
import { NotificationService } from '../notification/notification.service';
import { CreateSppDto } from './dto/create-spp.dto';
import { ListSppQuery } from './dto/list-spp.dto';
import { SummarySppQuery } from './dto/summary-spp.dto';

type NotificationHandoffResult = {
  status: 'none' | 'queued' | 'pending_recovery';
  requestedCount: number;
  queuedCount: number;
};

type NotificationLogRef = {
  refType: string;
  refId: string;
  recipient: string;
  channel: NotifChannel;
};

// ── Select shape ─────────────────────────────────────────────────────────────

const SPP_SELECT = {
  id:         true,
  studentId:  true,
  month:      true,
  year:       true,
  amount:     true,
  status:     true,
  paidAt:     true,
  receiptNo:  true,
  recordedBy: true,
  approvedBy: true,
  approvedAt: true,
  createdAt:  true,
  updatedAt:  true,
  student: {
    select: {
      id:  true,
      nis: true,
      user: { select: { fullName: true } },
    },
  },
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  private async enqueueCommittedNotificationLogs(ids: string[], source: string): Promise<NotificationHandoffResult> {
    if (ids.length === 0) return { status: 'none', requestedCount: 0, queuedCount: 0 };
    if (!this.notificationService) {
      logger.warn('[FinanceService] notification service unavailable; committed logs deferred to recovery', {
        source,
        count: ids.length,
      });
      return { status: 'pending_recovery', requestedCount: ids.length, queuedCount: 0 };
    }
    try {
      const result = await this.notificationService.enqueueCommittedPendingLogs(ids);
      return {
        status: result.queuedCount === ids.length ? 'queued' : 'pending_recovery',
        requestedCount: ids.length,
        queuedCount: result.queuedCount,
      };
    } catch (error: unknown) {
      logger.warn('[FinanceService] committed notification enqueue deferred to recovery', {
        source,
        count: ids.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'pending_recovery', requestedCount: ids.length, queuedCount: 0 };
    }
  }

  private notificationLogRefs(logs: Prisma.NotificationLogCreateManyInput[]): NotificationLogRef[] {
    const unique = new Map<string, NotificationLogRef>();
    for (const log of logs) {
      if (!log.refType || !log.refId || !log.recipient || !log.channel) continue;
      const ref = {
        refType: String(log.refType),
        refId: String(log.refId),
        recipient: String(log.recipient),
        channel: log.channel as NotifChannel,
      };
      unique.set(`${ref.refType}:${ref.refId}:${ref.recipient}:${ref.channel}`, ref);
    }
    return [...unique.values()];
  }

  private async committedPendingNotificationLogIds(
    tx: Prisma.TransactionClient,
    logs: Prisma.NotificationLogCreateManyInput[],
  ): Promise<string[]> {
    const refs = this.notificationLogRefs(logs);
    if (refs.length === 0) return [];
    const rows = await tx.notificationLog.findMany({
      where: {
        status: 'pending',
        OR: refs.map((ref) => ({
          refType: ref.refType,
          refId: ref.refId,
          recipient: ref.recipient,
          channel: ref.channel,
        })),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** keycloakId → student.id[] (anak untuk ORANG_TUA) */
  private async resolveChildStudentIds(keycloakId: string): Promise<string[]> {
    const userId = await resolveUserId(this.prisma, keycloakId);
    const children = await this.prisma.student.findMany({
      where: { parentId: userId },
      select: { id: true },
    });
    if (children.length === 0) {
      throw new ForbiddenException('Tidak ada data anak yang terdaftar untuk akun ini');
    }
    return children.map((c) => c.id);
  }

  // ── createRecord ─────────────────────────────────────────────────────────────

  async createRecord(dto: CreateSppDto, user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId);

    // P2002 (@@unique [studentId,month,year]) propagate ke PrismaExceptionFilter → 409
    const payment = await this.prisma.sppPayment.create({
      data: {
        studentId:  dto.studentId,
        month:      dto.month,
        year:       dto.year,
        amount:     dto.amount,
        status:     PaymentStatus.unpaid,
        receiptNo:  null,
        paidAt:     null,
        recordedBy: userId,
      },
      select: SPP_SELECT,
    });

    // Emit payment.received hanya jika pembayaran benar-benar diterima (paid/late)
    // N-10: TIDAK ada logika BOS di sini — TODO Tahap 2 saat model BOS tersedia
    return payment;
  }

  // ── findAll ──────────────────────────────────────────────────────────────────

  async findAll(query: ListSppQuery, user: AuthUser) {
    const where: Prisma.SppPaymentWhereInput = {};

    if (query.year)   where.year   = query.year;
    if (query.month)  where.month  = query.month;
    if (query.status) where.status = query.status as PaymentStatus;

    if (isSiswaOnly(user)) {
      // SISWA: hanya pembayaran sendiri — query.studentId diabaikan
      where.studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    } else if (isOrangTuaOnly(user)) {
      // ORANG_TUA: hanya pembayaran anak
      const childIds = await this.resolveChildStudentIds(user.keycloakId);
      where.studentId = { in: childIds };
    } else {
      // SA/KS/TU: filter opsional
      if (query.studentId) where.studentId = query.studentId;
      if (query.classId) where.student = { is: { classId: query.classId } };
    }
    if (query.search) {
      where.student = {
        is: {
          ...(query.classId && !isSiswaOnly(user) && !isOrangTuaOnly(user) ? { classId: query.classId } : {}),
          OR: [
            { nis: { contains: query.search, mode: 'insensitive' } },
            { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { class: { name: { contains: query.search, mode: 'insensitive' } } },
          ],
        },
      };
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.sppPayment.findMany({
        where,
        skip,
        take:    query.limit,
        select:  SPP_SELECT,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.sppPayment.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  // ── summary ──────────────────────────────────────────────────────────────────

  async summary(query: SummarySppQuery) {
    const where: Prisma.SppPaymentWhereInput = {};
    if (query.year)  where.year  = query.year;
    if (query.month) where.month = query.month;

    const groups = await this.prisma.sppPayment.groupBy({
      by:      ['year', 'month', 'status'],
      where,
      _sum:    { amount: true },
      _count:  { id: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return groups.map((g) => ({
      year:        g.year,
      month:       g.month,
      status:      g.status,
      totalAmount: g._sum.amount?.toString() ?? '0',
      count:       g._count.id,
    }));
  }

  // ── findHistory ──────────────────────────────────────────────────────────────

  async findHistory(studentId: string, user: AuthUser) {
    if (isSiswaOnly(user)) {
      // SISWA: studentId harus milik sendiri
      const ownStudentId = await resolveSiswaId(this.prisma, user.keycloakId);
      if (studentId !== ownStudentId) {
        throw new ForbiddenException('Siswa hanya bisa melihat riwayat pembayaran sendiri');
      }
    } else if (isOrangTuaOnly(user)) {
      // ORANG_TUA: studentId harus salah satu anaknya
      const childIds = await this.resolveChildStudentIds(user.keycloakId);
      if (!childIds.includes(studentId)) {
        throw new ForbiddenException('Orang tua hanya bisa melihat riwayat pembayaran anak');
      }
    }
    // SA/TU: akses ke studentId manapun

    // Pastikan student ada
    const student = await this.prisma.student.findUnique({
      where:  { id: studentId },
      select: { id: true, nis: true, user: { select: { fullName: true } } },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');

    const payments = await this.prisma.sppPayment.findMany({
      where:   { studentId },
      select:  SPP_SELECT,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return { student, payments };
  }

  // ── approve ──────────────────────────────────────────────────────────────────

  async approve(id: string, user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId);

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.sppPayment.findUnique({
        where:  { id },
        select: {
          id: true,
          status: true,
          approvedBy: true,
          approvedAt: true,
          month: true,
          year: true,
          amount: true,
          studentId: true,
          student: {
            select: {
              nis: true,
              user: { select: { fullName: true, phone: true } },
              parent: { select: { phone: true } },
            },
          },
        },
      });
      if (!payment) throw new NotFoundException('Data pembayaran SPP tidak ditemukan');
      if (payment.approvedBy || payment.status === 'paid') {
        throw new ConflictException('Pembayaran ini sudah disetujui sebelumnya');
      }

      const now = new Date();
      const receiptNo = `SPP-${payment.year}-${String(payment.month).padStart(2, '0')}-${payment.student.nis}-${payment.id.slice(0, 8).toUpperCase()}`;
      const updatedCount = await tx.sppPayment.updateMany({
        where: { id, status: PaymentStatus.unpaid, approvedBy: null, approvedAt: null },
        data: {
          approvedBy: userId,
          approvedAt: now,
          paidAt: now,
          receiptNo,
          status: PaymentStatus.paid,
        },
      });
      if (updatedCount.count !== 1) throw new ConflictException('Pembayaran ini sudah disetujui sebelumnya');

      const amountLabel = Number(payment.amount).toLocaleString('id-ID');
      const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const body = `Pembayaran SPP ${monthNames[payment.month] ?? `Bulan-${payment.month}`} ${payment.year} sebesar Rp ${amountLabel} untuk ${payment.student.user.fullName} telah diterima. No. kwitansi: ${receiptNo}.`;
      const recipients = new Set<string>();
      for (const rawPhone of [payment.student.user.phone, payment.student.parent?.phone]) {
        if (!rawPhone || rawPhone.trim().length === 0) continue;
        try {
          recipients.add(normalizePhoneE164(rawPhone));
        } catch {
          // Skip invalid legacy numbers; do not expose raw phone values in logs.
        }
      }
      const deliverableLogs: Prisma.NotificationLogCreateManyInput[] = [...recipients].map((recipient) => ({
        id: randomUUID(),
        recipient,
        channel: 'whatsapp',
        body,
        status: 'pending',
        refType: 'payment',
        refId: `${payment.id}:${recipient}`,
      }));
      if (deliverableLogs.length > 0) {
        await tx.notificationLog.createMany({ data: deliverableLogs, skipDuplicates: true });
      }
      const logIds = await this.committedPendingNotificationLogIds(tx, deliverableLogs);

      const updatedPayment = await tx.sppPayment.findUniqueOrThrow({
        where: { id },
        select: SPP_SELECT,
      });
      return {
        payment: updatedPayment,
        logIds,
      };
    });
    const notificationHandoff = await this.enqueueCommittedNotificationLogs(result.logIds, 'payment');
    return { ...result.payment, notificationHandoff };
  }
}
