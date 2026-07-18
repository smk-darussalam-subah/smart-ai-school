// =============================================================================
// PositionsService — Struktur Organisasi / jabatan (2J-5)
//
// Penugasan pegawai ke jabatan terikat tahun ajaran. Saat penugasan dibuat,
// izin jabatan (position_permissions) diterapkan sebagai UserPermissionOverride
// (grant=true); saat dilepas, override dicabut bila tak ada penugasan aktif lain
// yang masih memberi izin tsb. Cache izin user di-invalidate tiap perubahan.
//
// R-23: Position code di-sync sebagai Keycloak realm role (fail-soft).
// R-26: Cross-schema integrity check — orphan permission di-skip dengan warning.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { logger } from '@smk/logger';
import { POSITION_CODES, UserRole } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { AssignPositionDto } from './dto/position.dto';

// ── R-27: Segregation of Duties conflict rules ─────────────────────────────────
// Pasangan jabatan yang berisiko jika dipegang oleh orang yang sama.
// SOFT WARNING — assignment tetap diizinkan, tapi admin mendapat peringatan.
// Kategori risiko: fraud (keuangan+supervisi), konsentrasi akses (keuangan+SDM).
const CONFLICT_RULES: ReadonlyArray<{
  readonly positions: readonly [string, string];
  readonly risk: string;
}> = [
  {
    positions: ['BENDAHARA', 'STAF_KEPEGAWAIAN'],
    risk: 'Konsentrasi akses keuangan + kepegawaian — risiko penyalahgunaan data dan dana',
  },
  {
    positions: ['KEPALA_TU', 'BENDAHARA'],
    risk: 'Supervisi TU + eksekusi keuangan — konflik pengawasan dan pelaksanaan',
  },
];

/** R-27: Cek apakah position baru konflik dengan jabatan aktif user. */
function checkConflict(
  newPositionCode: string,
  activePositionCodes: string[],
): string | undefined {
  for (const rule of CONFLICT_RULES) {
    const [a, b] = rule.positions;
    // Cek kedua arah: newPositionCode=a & active=b, atau newPositionCode=b & active=a
    if (
      (newPositionCode === a && activePositionCodes.includes(b)) ||
      (newPositionCode === b && activePositionCodes.includes(a))
    ) {
      return `Kombinasi jabatan ${a} + ${b} berisiko: ${rule.risk}`;
    }
  }
  return undefined;
}

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly keycloakAdmin: KeycloakAdminService,
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
      select: { id: true, code: true, scopeType: true, permissions: { select: { permissionId: true } } },
    });
    if (!position) throw new NotFoundException('Jabatan tidak ditemukan.');

    if (position.scopeType === 'MAJOR' && !dto.majorId) {
      throw new BadRequestException('Jabatan ini memerlukan pilihan jurusan.');
    }
    if (position.scopeType !== 'MAJOR' && dto.majorId) {
      throw new BadRequestException('Jabatan ini tidak menggunakan jurusan.');
    }

    let created: { id: string };

    // R-27: Segregation of Duties — check conflict with existing active positions.
    // SOFT WARNING: assignment tetap diizinkan, tapi return warning untuk UI.
    let warning: string | undefined;
    if (position.scopeType !== 'MAJOR' || dto.majorId) {
      const activePositions = await this.prisma.staffPosition.findMany({
        where: {
          staffId: staff.id,
          academicYearId: dto.academicYearId,
          isActive: true,
        },
        select: { position: { select: { code: true } } },
      });
      const activeCodes = activePositions.map((ap) => ap.position.code);
      warning = checkConflict(position.code, activeCodes);
      if (warning) {
        logger.warn('[Positions] Segregation of Duties warning', {
          userId: dto.userId,
          newPosition: position.code,
          activePositions: activeCodes,
          warning,
        });
      }
    }

    // R-26: Cross-schema integrity check — validasi semua permission masih exist.
    // PositionPermission (schema school) → Permission (schema auth) tanpa FK.
    let validPermissions = position.permissions;
    if (position.permissions.length > 0) {
      const permIds = position.permissions.map((p) => p.permissionId);
      const existingPerms = await this.prisma.permission.findMany({
        where: { id: { in: permIds } },
        select: { id: true },
      });
      const existingIds = new Set(existingPerms.map((p) => p.id));
      const orphanIds = permIds.filter((id) => !existingIds.has(id));
      if (orphanIds.length > 0) {
        logger.warn('[Positions] Orphan permission detected — skipping', {
          orphanIds,
          positionCode: position.code,
        });
      }
      validPermissions = position.permissions.filter((p) => existingIds.has(p.permissionId));
    }

    // Terapkan izin jabatan sebagai override (grant=true) — hanya yang valid.
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.staffPosition.create({
          data: {
            staffId: staff.id,
            positionId: dto.positionId,
            academicYearId: dto.academicYearId,
            majorId: dto.majorId ?? null,
          },
          select: { id: true },
        });

        for (const pp of validPermissions) {
          await tx.userPermissionOverride.upsert({
            where: { userId_permissionId: { userId: dto.userId, permissionId: pp.permissionId } },
            update: { grant: true },
            create: { userId: dto.userId, permissionId: pp.permissionId, grant: true },
          });
        }

        return assignment;
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

    // R-23: Sync position code sebagai Keycloak realm role (fail-soft).
    // Jika Keycloak down/unreachable, permission override di DB tetap benar (Layer 2).
    // Admin bisa re-sync manual via POST /positions/sync-roles + re-assign.
    try {
      await this.keycloakAdmin.assignRealmRole(staff.user.keycloakId, position.code);
      logger.info(`[Positions] Synced role ${position.code} ke Keycloak untuk user ${staff.user.keycloakId}`);
    } catch (err) {
      logger.warn('[Positions] Gagal sync role ke Keycloak (fail-soft)', {
        keycloakId: staff.user.keycloakId,
        positionCode: position.code,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.permissions.invalidateUser(staff.user.keycloakId);

    // R-27: Return warning if segregation of duties conflict detected
    return warning ? { id: created.id, warning } : { id: created.id };
  }

  // ── Lepas penugasan + cabut izin yg tak lagi didukung jabatan lain ─────────
  async unassign(id: string) {
    // Refactored: include position.code + permissions in single query (eliminates redundant query)
    const sp = await this.prisma.staffPosition.findUnique({
      where: { id },
      select: {
        id: true,
        positionId: true,
        position: { select: { code: true, permissions: { select: { permissionId: true } } } },
        staff: { select: { userId: true, user: { select: { keycloakId: true } } } },
      },
    });
    if (!sp) throw new NotFoundException('Penugasan tidak ditemukan.');

    const userId = sp.staff.userId;
    const permIds = sp.position.permissions.map((p) => p.permissionId);

    await this.prisma.$transaction(async (tx) => {
      await tx.staffPosition.delete({ where: { id } });

      if (permIds.length) {
        // Izin yang masih diberikan oleh penugasan AKTIF lain milik user ini.
        const remaining = await tx.staffPosition.findMany({
          where: { staff: { userId }, isActive: true },
          select: { position: { select: { permissions: { select: { permissionId: true } } } } },
        });
        const stillGranted = new Set(
          remaining.flatMap((r) => r.position.permissions.map((p) => p.permissionId)),
        );
        const toRemove = permIds.filter((pid) => !stillGranted.has(pid));
        if (toRemove.length) {
          await tx.userPermissionOverride.deleteMany({
            where: { userId, permissionId: { in: toRemove }, grant: true },
          });
        }
      }
    });

    // R-23: Remove Keycloak realm role jika tidak ada penugasan aktif lain
    // dengan position code yang sama (fail-soft).
    const otherAssignmentsWithSameCode = await this.prisma.staffPosition.findFirst({
      where: {
        staff: { userId },
        position: { code: sp.position.code },
        isActive: true,
      },
    });
    if (!otherAssignmentsWithSameCode) {
      try {
        await this.keycloakAdmin.removeRealmRole(sp.staff.user.keycloakId, sp.position.code);
        logger.info(`[Positions] Removed role ${sp.position.code} dari Keycloak untuk user ${sp.staff.user.keycloakId}`);
      } catch (err) {
        logger.warn('[Positions] Gagal remove role dari Keycloak (fail-soft)', {
          keycloakId: sp.staff.user.keycloakId,
          positionCode: sp.position.code,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.permissions.invalidateUser(sp.staff.user.keycloakId);

    return { id };
  }

  // ── Jabatan aktif user yang sedang login (R-24/R-25 support) ────────────────
  async getMyPositions(keycloakId: string) {
    const ay = await this.getActiveAcademicYear();
    if (!ay) return { academicYear: null, positions: [] };

    const positions = await this.prisma.staffPosition.findMany({
      where: { staff: { user: { keycloakId } }, academicYearId: ay.id, isActive: true },
      select: {
        id: true,
        position: { select: { code: true, name: true, category: true } },
        major: { select: { code: true, name: true } },
      },
      orderBy: { position: { sortOrder: 'asc' } },
    });
    return { academicYear: ay, positions };
  }

  // ── Verifikasi effective access user (R-25) ─────────────────────────────────
  async accessCheck(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, keycloakId: true, fullName: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan.');

    // Layer 1: Keycloak realm roles (dari JWT origin)
    let keycloakRoles: string[] = [];
    try {
      keycloakRoles = await this.keycloakAdmin.getUserRealmRoles(user.keycloakId);
    } catch (err) {
      logger.warn('[Positions] Gagal mengambil Keycloak roles (fail-soft)', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Layer 2: Active positions from DB
    // PositionPermission.permissionId → auth.permissions adalah cross-schema tanpa FK,
    // jadi kita fetch permissionId lalu resolve code-nya secara terpisah.
    const ay = await this.getActiveAcademicYear();
    const activePositions = ay
      ? await this.prisma.staffPosition.findMany({
          where: { staff: { userId: user.id }, academicYearId: ay.id, isActive: true },
          select: {
            position: {
              select: {
                code: true,
                name: true,
                permissions: { select: { permissionId: true } },
              },
            },
            major: { select: { code: true, name: true } },
          },
        })
      : [];

    // Resolve position permission codes (cross-schema lookup)
    const positionPermIds = activePositions.flatMap((ap) =>
      ap.position.permissions.map((p) => p.permissionId),
    );
    const positionPermRecords = positionPermIds.length > 0
      ? await this.prisma.permission.findMany({
          where: { id: { in: positionPermIds } },
          select: { code: true },
        })
      : [];
    const positionPermissions = positionPermRecords.map((p) => p.code);

    // Effective permissions (role_permissions ∪ user_permission_overrides)
    const effectivePerms = await this.permissions.getEffectivePermissions(
      user.keycloakId,
      [user.role as UserRole],
    );

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email, dbRole: user.role },
      keycloakRoles,
      activePositions: activePositions.map((ap) => ({
        code: ap.position.code,
        name: ap.position.name,
        major: ap.major,
      })),
      positionPermissions: [...new Set(positionPermissions)].sort(),
      effectivePermissions: Array.from(effectivePerms).sort(),
    };
  }

  // ── Seed 13 position codes sebagai Keycloak realm roles (R-23 prasyarat) ────
  async syncKeycloakRoles() {
    // Ambil nama jabatan dari DB untuk description
    const positions = await this.prisma.position.findMany({
      where: { code: { in: [...POSITION_CODES] } },
      select: { code: true, name: true },
    });
    const nameMap = new Map(positions.map((p) => [p.code, p.name]));

    const created: string[] = [];
    const existing: string[] = [];
    const failed: { code: string; error: string }[] = [];

    for (const code of POSITION_CODES) {
      const description = nameMap.get(code) ?? code;
      try {
        const result = await this.keycloakAdmin.createRealmRoleIfNotExists(code, description);
        if (result === 'created') {
          created.push(code);
        } else {
          existing.push(code);
        }
      } catch (err) {
        logger.warn('[Positions] Gagal sync role ke Keycloak', {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        failed.push({ code, error: err instanceof Error ? err.message : String(err) });
      }
    }

    logger.info('[Positions] syncKeycloakRoles selesai', { created: created.length, existing: existing.length, failed: failed.length });
    return { created, existing, failed };
  }
}
