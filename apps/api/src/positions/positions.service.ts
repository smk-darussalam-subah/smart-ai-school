// =============================================================================
// PositionsService - Struktur Organisasi / jabatan (2J-5)
//
// Appointment Governance owns period-bound position authority. Legacy
// assign/unassign endpoints are intentionally fail-closed until the UI uses
// Appointment lifecycle states explicitly. Position codes stay inside DIIS and
// are never synced back to Keycloak realm roles.
// =============================================================================

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { POSITION_CODES, PRIMARY_ROLES, UserRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { getSchoolDate } from '../common/helpers/school-date.helper';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignPositionDto } from './dto/position.dto';

const KEYCLOAK_POSITION_ROLE_SYNC_PERMANENTLY_DISABLED = {
  status: 'disabled' as const,
  message:
    'Sinkronisasi role jabatan ke Keycloak dinonaktifkan permanen. Penugasan tersimpan di DIIS; akses jabatan diresolve via appointment governance + PositionPermission.',
};

const APPOINTMENT_AUTHORITY_ONLY_MESSAGE =
  'Penugasan jabatan legacy sudah ditutup. Gunakan alur Appointment Governance: buat draft, ajukan, setujui, lalu aktifkan appointment sebelum izin jabatan berlaku.';
const STRUCTURE_APPOINTMENT_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED'] as const;

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

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
        maxActiveHolders: true,
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

  async getAssignments(academicYearId?: string) {
    const ay = academicYearId
      ? await this.prisma.academicYear.findUnique({
          where: { id: academicYearId },
          select: { id: true, code: true },
        })
      : await this.getActiveAcademicYear();
    if (!ay) return { academicYear: null, assignments: [] };

    const schoolDate = getSchoolDate();
    const assignments = await this.prisma.appointment.findMany({
      where: {
        academicYearId: ay.id,
        status: { in: [...STRUCTURE_APPOINTMENT_STATUSES] },
      },
      orderBy: [{ position: { sortOrder: 'asc' } }, { effectiveFrom: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        positionId: true,
        majorId: true,
        kind: true,
        status: true,
        effectiveFrom: true,
        effectiveUntil: true,
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
    return {
      academicYear: ay,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        isEffectiveNow: this.isEffectiveAppointment(assignment, schoolDate),
      })),
    };
  }

  async assign(dto: AssignPositionDto) {
    logger.warn('[Positions] legacy assign blocked by appointment-only authority', {
      userId: dto.userId,
      positionId: dto.positionId,
      academicYearId: dto.academicYearId,
    });
    throw new ConflictException(APPOINTMENT_AUTHORITY_ONLY_MESSAGE);
  }

  async unassign(id: string) {
    logger.warn('[Positions] legacy unassign blocked by appointment-only authority', {
      legacyAssignmentId: id,
    });
    throw new ConflictException(APPOINTMENT_AUTHORITY_ONLY_MESSAGE);
  }

  async getMyPositions(keycloakId: string) {
    const ay = await this.getActiveAcademicYear();
    if (!ay) return { academicYear: null, positions: [] };

    const schoolDate = getSchoolDate();
    const positions = await this.prisma.appointment.findMany({
      where: {
        staff: { user: { keycloakId } },
        academicYear: { isActive: true },
        status: 'ACTIVE',
        effectiveFrom: { lte: schoolDate },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: schoolDate } },
        ],
      },
      select: {
        id: true,
        kind: true,
        status: true,
        effectiveFrom: true,
        effectiveUntil: true,
        position: { select: { code: true, name: true, category: true } },
        major: { select: { code: true, name: true } },
      },
      orderBy: { position: { sortOrder: 'asc' } },
    });
    return { academicYear: ay, positions };
  }

  async accessCheck(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, keycloakId: true, fullName: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan.');

    let keycloakRoles: string[] = [];
    try {
      keycloakRoles = await this.keycloakAdmin.getUserRealmRoles(user.keycloakId);
    } catch (err) {
      logger.warn('[Positions] Gagal mengambil Keycloak roles (fail-soft)', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const ay = await this.getActiveAcademicYear();
    const schoolDate = getSchoolDate();
    const activeAppointments = ay
      ? await this.prisma.appointment.findMany({
          where: {
            staff: { userId: user.id },
            academicYear: { isActive: true },
            status: 'ACTIVE',
            effectiveFrom: { lte: schoolDate },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gte: schoolDate } },
            ],
          },
          select: {
            id: true,
            kind: true,
            status: true,
            effectiveFrom: true,
            effectiveUntil: true,
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

    const appointmentPermIds = activeAppointments.flatMap((ap) =>
      ap.position.permissions.map((p) => p.permissionId),
    );
    const appointmentPermRecords =
      appointmentPermIds.length > 0
        ? await this.prisma.permission.findMany({
            where: { id: { in: appointmentPermIds } },
            select: { code: true },
          })
        : [];
    const appointmentPermissions = appointmentPermRecords.map((p) => p.code);

    const effectivePerms = await this.permissions.getEffectivePermissions(
      user.keycloakId,
      [user.role as UserRole],
    );

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        dbRole: user.role,
      },
      keycloakRoles,
      activeAppointments: activeAppointments.map((ap) => ({
        id: ap.id,
        code: ap.position.code,
        name: ap.position.name,
        kind: ap.kind,
        status: ap.status,
        effectiveFrom: ap.effectiveFrom,
        effectiveUntil: ap.effectiveUntil,
        major: ap.major,
      })),
      appointmentPermissions: [...new Set(appointmentPermissions)].sort(),
      effectivePermissions: Array.from(effectivePerms).sort(),
    };
  }

  async syncKeycloakRoles() {
    logger.warn(
      '[Positions] syncKeycloakRoles permanently skipped (appointment governance replaces Keycloak realm roles)',
    );
    return {
      ...KEYCLOAK_POSITION_ROLE_SYNC_PERMANENTLY_DISABLED,
      stableRoles: [...PRIMARY_ROLES],
      blockedPositionCodes: [...POSITION_CODES],
      operationRef: 'appointment-governance-permanent-skip',
    };
  }

  private isEffectiveAppointment(
    appointment: { status: string; effectiveFrom: Date; effectiveUntil: Date | null },
    schoolDate: Date,
  ): boolean {
    return (
      appointment.status === 'ACTIVE' &&
      appointment.effectiveFrom <= schoolDate &&
      (!appointment.effectiveUntil || appointment.effectiveUntil >= schoolDate)
    );
  }
}
