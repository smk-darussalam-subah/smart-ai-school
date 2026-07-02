// =============================================================================
// KktpConfigService — T3-02 (B5): KKTP config per-subject persistence.
// KS/Wakakur sets custom KKTP threshold per mapel per tahun ajaran.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserId } from '../common/helpers/role-helpers';
import { AuthUser } from '@smk/auth';
import { UpsertKktpDto, ListKktpQuery } from './dto/kktp-config.dto';

const DEFAULT_KKTP = 75;

@Injectable()
export class KktpConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** List all KKTP configs, optionally filtered by academicYear + semester. */
  async findAll(query: ListKktpQuery) {
    const where = {
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };
    return this.prisma.kktpConfig.findMany({
      where,
      orderBy: [{ subject: 'asc' }],
    });
  }

  /** Upsert a KKTP config for a subject + academicYear + semester. */
  async upsert(dto: UpsertKktpDto, user: AuthUser) {
    const userId = await resolveUserId(this.prisma, user.keycloakId).catch(() => null);
    return this.prisma.kktpConfig.upsert({
      where: {
        subject_academicYear_semester: {
          subject: dto.subject,
          academicYear: dto.academicYear,
          semester: dto.semester,
        },
      },
      create: {
        subject: dto.subject,
        kktp: dto.kktp,
        academicYear: dto.academicYear,
        semester: dto.semester,
        createdBy: userId,
      },
      update: {
        kktp: dto.kktp,
        createdBy: userId,
      },
    });
  }

  /** Delete a KKTP config (revert to default). */
  async remove(subject: string, academicYear: string, semester: number) {
    await this.prisma.kktpConfig.deleteMany({
      where: { subject, academicYear, semester },
    });
    return { deleted: true };
  }

  /** Get KKTP for a specific subject, or default if not configured. */
  async getKktp(subject: string, academicYear: string, semester: number): Promise<number> {
    const config = await this.prisma.kktpConfig.findUnique({
      where: {
        subject_academicYear_semester: { subject, academicYear, semester },
      },
      select: { kktp: true },
    });
    return config?.kktp ?? DEFAULT_KKTP;
  }
}
