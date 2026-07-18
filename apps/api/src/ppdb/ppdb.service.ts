import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitLeadDto, SubmitSpmbIntakeDto } from './dto/submit-lead.dto';
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
  assignedTo: true,
  followUpAt: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { id: true, fullName: true, email: true } },
} as const;

const LEAD_DETAIL_SELECT = {
  ...LEAD_LIST_SELECT,
  notes: true,
} as const;

const TERMINAL_STATUSES = new Set<LeadStatus>([LeadStatus.accepted, LeadStatus.rejected]);

const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.new]: [LeadStatus.contacted, LeadStatus.cold, LeadStatus.rejected],
  [LeadStatus.contacted]: [LeadStatus.interested, LeadStatus.cold, LeadStatus.rejected],
  [LeadStatus.interested]: [LeadStatus.registered, LeadStatus.cold, LeadStatus.rejected],
  [LeadStatus.registered]: [LeadStatus.paid, LeadStatus.rejected],
  [LeadStatus.paid]: [LeadStatus.accepted, LeadStatus.rejected],
  [LeadStatus.accepted]: [],
  [LeadStatus.rejected]: [],
  [LeadStatus.cold]: [LeadStatus.contacted, LeadStatus.rejected],
};

type LeadListItem = {
  id: string;
  fullName: string;
  phone: string;
  interestMajor: string | null;
  status: LeadStatus | string;
};

type EnrollmentAction = {
  enrollmentRequired: true;
  enrollmentAction: {
    type: 'create_student';
    href: string;
    label: string;
    reason: string;
  };
};

type PublicIntakeReceipt = {
  id: string;
  status: string;
  registrationNo: string;
  submittedAt: string;
};

type NormalizedSpmbIntakePayload = {
  applicantRole: SubmitSpmbIntakeDto['applicantRole'];
  fullName: string;
  gender: SubmitSpmbIntakeDto['gender'];
  nisn: string | null;
  schoolOrigin: string;
  interestMajor: SubmitSpmbIntakeDto['interestMajor'];
  guardianName: string;
  guardianRelation: string;
  phone: string;
  email: string | null;
  consent: true;
};

const SPMB_2027_ACADEMIC_YEAR = '2027/2028';
const SPMB_2027_INTAKE_VERSION = 'spmb-2027-2028-intake-v2-2026-07-19';

function buildRegistrationNo(id: string): string {
  const suffix = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SPMB-2027-${suffix}`;
}

function normalizeSpmbIntakePayload(dto: SubmitSpmbIntakeDto): NormalizedSpmbIntakePayload {
  return {
    applicantRole: dto.applicantRole,
    fullName: dto.fullName.trim(),
    gender: dto.gender,
    nisn: dto.nisn?.trim() || null,
    schoolOrigin: dto.schoolOrigin.trim(),
    interestMajor: dto.interestMajor,
    guardianName: dto.guardianName.trim(),
    guardianRelation: dto.guardianRelation.trim(),
    phone: dto.phone,
    email: dto.email?.trim().toLowerCase() || null,
    consent: true,
  };
}

function buildPayloadFingerprint(payload: NormalizedSpmbIntakePayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStoredPayloadFingerprint(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed: unknown = JSON.parse(notes);
    if (isRecord(parsed) && typeof parsed.payloadFingerprint === 'string') {
      return parsed.payloadFingerprint;
    }
  } catch {
    return null;
  }
  return null;
}

@Injectable()
export class PpdbService {
  constructor(private prisma: PrismaService) {}

  private toPublicIntakeReceipt(lead: { id: string; status: LeadStatus | string; createdAt: Date }): PublicIntakeReceipt {
    return {
      id: lead.id,
      status: lead.status,
      registrationNo: buildRegistrationNo(lead.id),
      submittedAt: lead.createdAt.toISOString(),
    };
  }

  private attachEnrollmentAction<T extends LeadListItem>(lead: T): T | (T & EnrollmentAction) {
    if (lead.status !== LeadStatus.accepted) return lead;
    const params = new URLSearchParams({ ppdbLeadId: lead.id });
    return {
      ...lead,
      enrollmentRequired: true,
      enrollmentAction: {
        type: 'create_student',
        href: `/dashboard/siswa?${params.toString()}`,
        label: 'Daftarkan sebagai siswa',
        reason: 'Lead PPDB accepted harus dibuat sebagai Student secara eksplisit agar consent, NIS, kelas, dan data wali tidak dikarang.',
      },
    };
  }

  private assertTransition(current: LeadStatus, next: LeadStatus) {
    if (current === next) return;
    if (TERMINAL_STATUSES.has(current)) {
      throw new ConflictException('Lead sudah terminal dan tidak bisa diubah statusnya');
    }
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new ConflictException(`Transisi status PPDB tidak valid: ${current} -> ${next}`);
    }
  }

  async submitLead(dto: SubmitLeadDto, ipAddress: string): Promise<{ id: string; status: string }> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _hp, ...leadData } = dto;

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

  async submitSpmbIntake(dto: SubmitSpmbIntakeDto, ipAddress: string): Promise<PublicIntakeReceipt> {
    const submittedAt = new Date();
    const payload = normalizeSpmbIntakePayload(dto);
    const payloadFingerprint = buildPayloadFingerprint(payload);
    const intakeMeta = {
      kind: 'spmb_2027_2028_intake',
      version: SPMB_2027_INTAKE_VERSION,
      academicYear: SPMB_2027_ACADEMIC_YEAR,
      idempotencyKey: dto.idempotencyKey,
      payloadFingerprint,
      applicantRole: payload.applicantRole,
      gender: payload.gender,
      nisn: payload.nisn,
      guardianName: payload.guardianName,
      guardianRelation: payload.guardianRelation,
      email: payload.email,
      consent: {
        accepted: true,
        version: SPMB_2027_INTAKE_VERSION,
        acceptedAt: submittedAt.toISOString(),
      },
      proofChannels: {
        pdf: 'pending_server_configuration',
        whatsapp: 'pending_provider_configuration',
        email: dto.email ? 'pending_provider_configuration' : 'not_requested',
      },
    };

    const lead = await this.prisma.$transaction(async (tx) => {
      const lockKey = `ppdb-spmb-intake:${dto.idempotencyKey}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.ppdbLead.findFirst({
        where: {
          source: 'website',
          notes: { contains: `"idempotencyKey":"${dto.idempotencyKey}"` },
        },
        select: { id: true, status: true, createdAt: true, notes: true },
      });
      if (existing) {
        const existingFingerprint = readStoredPayloadFingerprint(existing.notes);
        if (existingFingerprint !== payloadFingerprint) {
          throw new ConflictException('Data retry tidak cocok dengan pendaftaran sebelumnya');
        }
        return existing;
      }

      return tx.ppdbLead.create({
        data: {
          fullName: payload.fullName,
          phone: payload.phone,
          schoolOrigin: payload.schoolOrigin,
          interestMajor: payload.interestMajor,
          source: 'website',
          status: LeadStatus.new,
          notes: JSON.stringify(intakeMeta),
        },
        select: { id: true, status: true, createdAt: true },
      });
    });

    logger.info('SPMB 2027/2028 intake submitted', {
      leadId: lead.id,
      ip: ipAddress,
      source: 'website',
      academicYear: SPMB_2027_ACADEMIC_YEAR,
    });

    return this.toPublicIntakeReceipt(lead);
  }

  async findAll(query: ListLeadsQuery) {
    const { status, source, search, dateFrom, dateTo, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      ...(status && { status }),
      ...(source && { source }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
          { schoolOrigin: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
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

    return { data: data.map((lead) => this.attachEnrollmentAction(lead)), total, page, limit };
  }

  async findById(id: string) {
    const lead = await this.prisma.ppdbLead.findUnique({
      where: { id },
      select: LEAD_DETAIL_SELECT,
    });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');
    return this.attachEnrollmentAction(lead);
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const lead = await this.findById(id);
    this.assertTransition(lead.status as LeadStatus, dto.status as LeadStatus);
    const updated = await this.prisma.ppdbLead.update({
      where: { id },
      data: dto,
      select: LEAD_DETAIL_SELECT,
    });
    return this.attachEnrollmentAction(updated);
  }

  async assignLead(id: string, dto: AssignLeadDto) {
    await this.findById(id);
    if (dto.assignedTo) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedTo,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          role: true,
          staff: { select: { id: true, deletedAt: true } },
        },
      });
      if (
        !assignee ||
        !assignee.staff ||
        assignee.staff.deletedAt ||
        !['SUPER_ADMIN', 'TATA_USAHA'].includes(assignee.role)
      ) {
        throw new BadRequestException('Assignee PPDB harus staff aktif dengan role SUPER_ADMIN atau TATA_USAHA');
      }
    }
    return this.prisma.ppdbLead.update({
      where: { id },
      data: { assignedTo: dto.assignedTo },
      select: LEAD_DETAIL_SELECT,
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

    const accepted = statusMap.accepted ?? 0;
    const conversionRate = total > 0 ? parseFloat(((accepted / total) * 100).toFixed(2)) : 0;

    return { total, byStatus: statusMap, conversionRate };
  }
}
