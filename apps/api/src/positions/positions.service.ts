// =============================================================================
// PositionsService — Struktur Organisasi / jabatan (2J-5)
//
// Penugasan pegawai ke jabatan terikat tahun ajaran. Saat penugasan dibuat,
// izin jabatan (position_permissions) diterapkan sebagai UserPermissionOverride
// (grant=true); saat dilepas, override dicabut bila tak ada penugasan aktif lain
// yang masih memberi izin tsb. Cache izin user di-invalidate tiap perubahan.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AssignPositionDto } from './dto/position.dto';

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  // ── Katalog jabatan (UI bangun pohon dari parentId) ─────────────────────────
  async getCatalog() {
    return this.prisma.position.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        scopeType: true,
        parentId: true,
        _count: { select: { permissions: true } },
      },
    });
  }

  async getActiveAcademicYear() {
    return this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, code: true },
      orderBy: { code: 'desc' },
    });
  }

  // ── Penugasan aktif untuk satu tahun ajaran (default: tahun aktif) ──────────
  async getAssignments(academicYearId?: string) {
    const ay = academicYearId
      ? await this.prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true, code: true } })
      : await this.getActiveAcademicYear();
    if (!ay) return { academicYear: null, assignments: [] };

    const assignments = await this.prisma.staffPosition.findMany({
      where: { academicYearId: ay.id, isActive: true },
      orderBy: { position: { sortOrder: 'asc' } },
      select: {
        id: true,
        positionId: true,
        majorId: true,
        position: { select: { code: true, name: true, category: true } },
        major: { select: { code: true, name: true } },
        staff: {
          select: {
            niy: true,
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    return { academicYear: ay, assignments };
  }

  // ── Tetapkan pegawai ke jabatan ─────────────────────────────────────────────
  async assign(dto: AssignPositionDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: dto.userId },
      select: { id: true, user: { select: { keycloakId: true } } },
    });
    if (!staff) {
      throw new BadRequestException('Pengguna ini bukan pegawai (tidak memiliki data kepegawaian).');
    }

    const position = await this.prisma.position.findUnique({
      where: { id: dto.positionId },
      select: { id: true, scopeType: true, permissions: { select: { permissionId: true } } },
    });
    if (!position) throw new NotFoundException('Jabatan tidak ditemukan.');

    if (position.scopeType === 'MAJOR' && !dto.majorId) {
      throw new BadRequestException('Jabatan ini memerlukan pilihan jurusan.');
    }
    if (position.scopeType !== 'MAJOR' && dto.majorId) {
      throw new BadRequestException('Jabatan ini tidak menggunakan jurusan.');
    }

    let created: { id: string };
    try {
      created = await this.prisma.staffPosition.create({
        data: {
          staffId: staff.id,
          positionId: dto.positionId,
          academicYearId: dto.academicYearId,
          majorId: dto.majorId ?? null,
        },
        select: { id: true },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Penugasan ini sudah ada untuk tahun ajaran tersebut.');
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException('Tahun ajaran atau jurusan tidak valid.');
      }
      throw err;
    }

    // Terapkan izin jabatan sebagai override (grant=true).
    for (const pp of position.permissions) {
      await this.prisma.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: dto.userId, permissionId: pp.permissionId } },
        update: { grant: true },
        create: { userId: dto.userId, permissionId: pp.permissionId, grant: true },
      });
    }
    this.permissions.invalidateUser(staff.user.keycloakId);

    return { id: created.id };
  }

  // ── Lepas penugasan + cabut izin yg tak lagi didukung jabatan lain ─────────
  async unassign(id: string) {
    const sp = await this.prisma.staffPosition.findUnique({
      where: { id },
      select: {
        id: true,
        positionId: true,
        staff: { select: { userId: true, user: { select: { keycloakId: true } } } },
      },
    });
    if (!sp) throw new NotFoundException('Penugasan tidak ditemukan.');

    const userId = sp.staff.userId;
    const thisPos = await this.prisma.position.findUnique({
      where: { id: sp.positionId },
      select: { permissions: { select: { permissionId: true } } },
    });
    const permIds = thisPos?.permissions.map((p) => p.permissionId) ?? [];

    await this.prisma.staffPosition.delete({ where: { id } });

    if (permIds.length) {
      // Izin yang masih diberikan oleh penugasan AKTIF lain milik user ini.
      const remaining = await this.prisma.staffPosition.findMany({
        where: { staff: { userId }, isActive: true },
        select: { position: { select: { permissions: { select: { permissionId: true } } } } },
      });
      const stillGranted = new Set(
        remaining.flatMap((r) => r.position.permissions.map((p) => p.permissionId)),
      );
      const toRemove = permIds.filter((pid) => !stillGranted.has(pid));
      if (toRemove.length) {
        await this.prisma.userPermissionOverride.deleteMany({
          where: { userId, permissionId: { in: toRemove }, grant: true },
        });
      }
    }
    this.permissions.invalidateUser(sp.staff.user.keycloakId);

    return { id };
  }
}
