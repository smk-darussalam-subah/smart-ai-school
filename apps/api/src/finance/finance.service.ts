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
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentStatus, Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveSiswaId } from '../common/helpers/role-helpers';
import { CreateSppDto } from './dto/create-spp.dto';
import { ListSppQuery } from './dto/list-spp.dto';
import { SummarySppQuery } from './dto/summary-spp.dto';
import { EVENTS, PaymentReceivedPayload } from '../events/events.types';

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
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
        receiptNo:  dto.receiptNo,
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

    const payment = await this.prisma.sppPayment.findUnique({
      where:  { id },
      select: { id: true, status: true, approvedBy: true, approvedAt: true },
    });
    if (!payment) throw new NotFoundException('Data pembayaran SPP tidak ditemukan');
    if (payment.approvedBy || payment.status === 'paid') {
      throw new ConflictException('Pembayaran ini sudah disetujui sebelumnya');
    }

    const updated = await this.prisma.sppPayment.update({
      where: { id },
      data:  {
        approvedBy: userId,
        approvedAt: new Date(),
        paidAt: new Date(),
        status: PaymentStatus.paid,
      },
      select: SPP_SELECT,
    });

    const payPayload: PaymentReceivedPayload = {
      paymentId:  updated.id,
      studentId:  updated.studentId,
      month:      updated.month,
      year:       updated.year,
      amount:     updated.amount.toString(),
      receiptNo:  updated.receiptNo ?? null,
    };
    this.eventEmitter.emit(EVENTS.PAYMENT_RECEIVED, payPayload);

    return updated;
  }
}
