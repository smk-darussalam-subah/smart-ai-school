// =============================================================================
// PpdbService — PPDB lead pipeline
//
// POST /ppdb/leads adalah public-write endpoint — rentan abuse.
// Hardening layers (sprint-plan §3.4):
//   1. Rate-limit per-IP ketat (controller)
//   2. Zod .strict() + validasi phone regex (DTO)
//   3. Honeypot _hp field (controller)
//   4. IP logging di sini
//   5. Captcha hook via env PPDB_CAPTCHA_SECRET (opsional)
//   6. Response publik hanya { id, status } — TIDAK return data lead lain
// =============================================================================

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { ListLeadsQuery } from './dto/list-leads.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';

const LEAD_LIST_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  schoolOrigin: true,
  interestMajor: true,
  source: true,
  status: true,
  notes: true,
  assignedTo: true,
  followUpAt: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { id: true, fullName: true, email: true } },
} as const;

@Injectable()
export class PpdbService {
  constructor(private prisma: PrismaService) {}

  /**
   * Buat lead baru dari form publik.
   * Log IP untuk audit trail. Response HANYA { id, status }.
   * Captcha opsional — diaktifkan via PPDB_CAPTCHA_SECRET env.
   */
  async submitLead(dto: SubmitLeadDto, ipAddress: string): Promise<{ id: string; status: string }> {
    // Captcha hook — aktif hanya jika env di-set
    if (process.env.PPDB_CAPTCHA_SECRET && !dto.captchaToken) {
      // TODO: verifikasi ke captcha provider (hCaptcha/reCAPTCHA) di SMA-34+
      // Untuk sekarang, jika secret ada tapi token kosong → tolak
      throw new BadRequestException('Captcha token diperlukan');
    }

    // Hapus field meta sebelum simpan ke DB
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _hp, captchaToken, ...leadData } = dto;

    const lead = await this.prisma.ppdbLead.create({
      data: leadData,
      select: { id: true, status: true },
    });

    logger.info('PPDB lead submitted', {
      leadId: lead.id,
      ip: ipAddress,
      source: leadData.source,
    });

    return { id: lead.id, status: lead.status };
  }

  async findAll(query: ListLeadsQuery) {
    const { status, source, dateFrom, dateTo, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      ...(status && { status }),
      ...(source && { source }),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.ppdbLead.findMany({
        where,
        skip,
        take: limit,
        select: LEAD_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ppdbLead.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const lead = await this.prisma.ppdbLead.findUnique({
      where: { id },
      select: LEAD_LIST_SELECT,
    });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');
    return lead;
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    await this.findById(id); // ensure exists first
    return this.prisma.ppdbLead.update({
      where: { id },
      data: dto,
      select: LEAD_LIST_SELECT,
    });
  }

  async assignLead(id: string, dto: AssignLeadDto) {
    await this.findById(id);
    return this.prisma.ppdbLead.update({
      where: { id },
      data: { assignedTo: dto.assignedTo },
      select: LEAD_LIST_SELECT,
    });
  }

  async getStats() {
    const [byStatus, total] = await Promise.all([
      this.prisma.ppdbLead.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.ppdbLead.count(),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((s) => [s.status, s._count.id]),
    ) as Record<string, number>;

    const accepted = statusMap['accepted'] ?? 0;
    const conversionRate = total > 0 ? parseFloat(((accepted / total) * 100).toFixed(2)) : 0;

    return { total, byStatus: statusMap, conversionRate };
  }
}
