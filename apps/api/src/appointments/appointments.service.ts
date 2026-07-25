import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  AppointmentEndDto,
  AppointmentDecisionDto,
  AppointmentListQueryDto,
  AppointmentSuspendDto,
  AppointmentSupersedeDto,
  CreateAppointmentDto,
} from './dto/appointment.dto';

const ELIGIBLE_APPOINTMENT_ROLES = new Set(['GURU', 'TATA_USAHA']);
const OPEN_REPLACEMENT_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] as const;
const PREPARED_STATUSES = ['PENDING_APPROVAL', 'APPROVED'] as const;
const ACTIVE_CAPACITY_STATUS = 'ACTIVE' as const;
const SUSPENDED_STATUS = 'SUSPENDED' as const;

type AppointmentTransitionTarget = {
  id: string;
  status: string;
  kind: string;
  academicYearId: string;
  majorId: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  reason: string | null;
  replacesAppointmentId: string | null;
  position: { id: string; code: string; scopeType: string };
  staff: { user: { keycloakId: string } };
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(query: AppointmentListQueryDto) {
    const where: Prisma.AppointmentWhereInput = {};
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.status) where.status = query.status;

    return this.prisma.appointment.findMany({
      where,
      orderBy: [{ academicYear: { code: 'desc' } }, { position: { sortOrder: 'asc' } }],
      select: {
        id: true,
        kind: true,
        status: true,
        effectiveFrom: true,
        effectiveUntil: true,
        reason: true,
        approvedAt: true,
        activatedAt: true,
        suspendedAt: true,
        suspensionUntil: true,
        suspensionReason: true,
        endedAt: true,
        staff: {
          select: {
            id: true,
            niy: true,
            user: { select: { id: true, fullName: true, email: true, role: true } },
          },
        },
        position: { select: { id: true, code: true, name: true, scopeType: true } },
        academicYear: { select: { id: true, code: true, isActive: true } },
        major: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async createDraft(dto: CreateAppointmentDto, actor: AuthUser) {
    const actorUser = await this.requireActor(actor);
    const context = await this.validateContext(dto);
    await this.assertCanPrepare(actor, context.position.code);
    await this.assertReplacementPlan(dto);

    try {
      return await this.prisma.appointment.create({
        data: {
          staffId: dto.staffId,
          positionId: dto.positionId,
          academicYearId: dto.academicYearId,
          majorId: dto.majorId ?? null,
          kind: dto.kind,
          status: 'DRAFT',
          effectiveFrom: dto.effectiveFrom,
          effectiveUntil: dto.effectiveUntil ?? null,
          reason: dto.reason ?? null,
          requestedByUserId: actorUser.id,
          replacesAppointmentId: dto.replacesAppointmentId ?? null,
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      this.rethrowConstraint(error);
      throw error;
    }
  }

  async submit(id: string, actor: AuthUser) {
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanPrepare(actor, appointment.position.code);
    if (appointment.status !== 'DRAFT') {
      throw new ConflictException('Hanya appointment DRAFT yang dapat diajukan.');
    }
    await this.assertSubmitDoesNotDuplicateOpenCandidate(appointment);

    return this.updateStatus(id, appointment.staff.user.keycloakId, {
      status: 'PENDING_APPROVAL',
    });
  }

  async approve(id: string, dto: AppointmentDecisionDto, actor: AuthUser) {
    const actorUser = await this.requireActor(actor);
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanApprove(actor, appointment.position.code);
    if (appointment.status !== 'PENDING_APPROVAL') {
      throw new ConflictException('Hanya appointment PENDING_APPROVAL yang dapat disetujui.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.appointmentApproval.create({
        data: {
          appointmentId: id,
          approverUserId: actorUser.id,
          decision: 'APPROVED',
          note: dto.note ?? null,
        },
      });
      return tx.appointment.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
        },
        select: { id: true, status: true, approvedAt: true },
      });
    });

    this.permissions.invalidateUser(appointment.staff.user.keycloakId);
    return result;
  }

  async reject(id: string, dto: AppointmentDecisionDto, actor: AuthUser) {
    const actorUser = await this.requireActor(actor);
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanApprove(actor, appointment.position.code);
    if (appointment.status !== 'PENDING_APPROVAL') {
      throw new ConflictException('Hanya appointment PENDING_APPROVAL yang dapat ditolak.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.appointmentApproval.create({
        data: {
          appointmentId: id,
          approverUserId: actorUser.id,
          decision: 'REJECTED',
          note: dto.note ?? null,
        },
      });
      return tx.appointment.update({
        where: { id },
        data: { status: 'REJECTED', endedAt: new Date() },
        select: { id: true, status: true, endedAt: true },
      });
    });

    this.permissions.invalidateUser(appointment.staff.user.keycloakId);
    return result;
  }

  async cancel(id: string, actor: AuthUser) {
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanPrepare(actor, appointment.position.code);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(appointment.status)) {
      throw new ConflictException('Appointment ini tidak dapat dibatalkan.');
    }

    return this.updateStatus(id, appointment.staff.user.keycloakId, {
      status: 'CANCELLED',
      endedAt: new Date(),
    });
  }

  async suspend(id: string, dto: AppointmentSuspendDto, actor: AuthUser) {
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanApprove(actor, appointment.position.code);
    if (appointment.status !== ACTIVE_CAPACITY_STATUS || appointment.kind !== 'DEFINITIVE') {
      throw new ConflictException('Hanya appointment definitif ACTIVE yang dapat disuspend.');
    }
    if (dto.expectedReturnDate < appointment.effectiveFrom) {
      throw new BadRequestException('Tanggal kembali tidak boleh lebih awal dari tanggal mulai appointment.');
    }
    if (appointment.effectiveUntil && dto.expectedReturnDate > appointment.effectiveUntil) {
      throw new BadRequestException('Tanggal kembali tidak boleh melewati tanggal akhir appointment.');
    }

    return this.updateStatus(id, appointment.staff.user.keycloakId, {
      status: SUSPENDED_STATUS,
      suspendedAt: new Date(),
      suspensionUntil: dto.expectedReturnDate,
      suspensionReason: dto.reason,
    });
  }

  async resume(id: string, actor: AuthUser) {
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanApprove(actor, appointment.position.code);
    if (appointment.status !== SUSPENDED_STATUS || appointment.kind !== 'DEFINITIVE') {
      throw new ConflictException('Hanya appointment definitif SUSPENDED yang dapat dilanjutkan kembali.');
    }
    await this.assertNoActiveScopeConflict(appointment);

    return this.updateStatus(id, appointment.staff.user.keycloakId, {
      status: ACTIVE_CAPACITY_STATUS,
      suspensionUntil: null,
      suspensionReason: null,
    });
  }

  async end(id: string, dto: AppointmentEndDto, actor: AuthUser) {
    const appointment = await this.getTransitionTarget(id);
    await this.assertCanApprove(actor, appointment.position.code);
    if (!['ACTIVE', 'SUSPENDED', 'APPROVED'].includes(appointment.status)) {
      throw new ConflictException('Hanya appointment ACTIVE, SUSPENDED, atau APPROVED yang dapat diakhiri.');
    }
    const effectiveUntil = dto.effectiveUntil ?? this.today();
    if (effectiveUntil < appointment.effectiveFrom) {
      throw new BadRequestException('Tanggal akhir tidak boleh lebih awal dari tanggal mulai appointment.');
    }

    return this.updateStatus(id, appointment.staff.user.keycloakId, {
      status: 'ENDED',
      effectiveUntil,
      endedAt: new Date(),
      reason: dto.reason,
    });
  }

  async supersede(id: string, dto: AppointmentSupersedeDto, actor: AuthUser) {
    const successor = await this.getTransitionTarget(id);
    await this.assertCanApprove(actor, successor.position.code);
    if (successor.status !== 'APPROVED') {
      throw new ConflictException('Hanya successor APPROVED yang dapat diaktifkan.');
    }
    if (!successor.replacesAppointmentId) {
      throw new BadRequestException('Supersede memerlukan replacesAppointmentId.');
    }

    const replaced = await this.getTransitionTarget(successor.replacesAppointmentId);
    this.assertSameScope(successor, replaced);

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      if (successor.kind === 'PLT') {
        if (replaced.status !== SUSPENDED_STATUS) {
          throw new ConflictException('PLT hanya dapat aktif saat appointment definitif sedang SUSPENDED.');
        }
        return tx.appointment.update({
          where: { id },
          data: {
            status: ACTIVE_CAPACITY_STATUS,
            activatedAt: now,
            reason: dto.reason ?? successor.reason,
          },
          select: { id: true, status: true, activatedAt: true },
        });
      }

      if (!['ACTIVE', 'SUSPENDED'].includes(replaced.status)) {
        throw new ConflictException('Appointment yang digantikan harus ACTIVE atau SUSPENDED.');
      }
      await tx.appointment.update({
        where: { id: replaced.id },
        data: {
          status: 'SUPERSEDED',
          supersededById: successor.id,
          endedAt: now,
          reason: dto.reason ?? replaced.reason,
        },
      });
      return tx.appointment.update({
        where: { id },
        data: {
          status: ACTIVE_CAPACITY_STATUS,
          activatedAt: now,
          reason: dto.reason ?? successor.reason,
        },
        select: { id: true, status: true, activatedAt: true },
      });
    }).catch((error) => {
      this.rethrowConstraint(error);
      throw error;
    });

    this.permissions.invalidateUser(successor.staff.user.keycloakId);
    this.permissions.invalidateUser(replaced.staff.user.keycloakId);
    return result;
  }

  private async validateContext(dto: CreateAppointmentDto) {
    const [staff, position, academicYear] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: dto.staffId },
        select: {
          id: true,
          deletedAt: true,
          user: {
            select: {
              id: true,
              role: true,
              keycloakId: true,
              isActive: true,
              deletedAt: true,
            },
          },
        },
      }),
      this.prisma.position.findUnique({
        where: { id: dto.positionId },
        select: { id: true, code: true, scopeType: true },
      }),
      this.prisma.academicYear.findUnique({
        where: { id: dto.academicYearId },
        select: { id: true, startDate: true, endDate: true },
      }),
    ]);

    if (!staff) throw new BadRequestException('Staff tidak ditemukan.');
    if (!position) throw new BadRequestException('Jabatan tidak ditemukan.');
    if (!academicYear) throw new BadRequestException('Tahun ajaran tidak ditemukan.');
    if (staff.deletedAt) throw new BadRequestException('Staff sudah dihapus dan tidak dapat menerima appointment.');
    if (staff.user.deletedAt) throw new BadRequestException('User pegawai sudah dihapus dan tidak dapat menerima appointment.');
    if (!staff.user.isActive) throw new BadRequestException('User pegawai tidak aktif dan tidak dapat menerima appointment.');
    if (!ELIGIBLE_APPOINTMENT_ROLES.has(staff.user.role)) {
      throw new BadRequestException('Candidate appointment harus pegawai aktif dengan role stabil GURU atau TATA_USAHA.');
    }

    if (position.scopeType === 'MAJOR' && !dto.majorId) {
      throw new BadRequestException('Jabatan ini memerlukan jurusan.');
    }
    if (position.scopeType !== 'MAJOR' && dto.majorId) {
      throw new BadRequestException('Jabatan ini tidak menggunakan jurusan.');
    }
    if (dto.majorId) {
      const major = await this.prisma.major.findUnique({
        where: { id: dto.majorId },
        select: { id: true },
      });
      if (!major) throw new BadRequestException('Jurusan tidak ditemukan.');
    }

    if (dto.effectiveFrom < academicYear.startDate || dto.effectiveFrom > academicYear.endDate) {
      throw new BadRequestException('Tanggal mulai appointment harus berada dalam tahun ajaran.');
    }
    if (dto.effectiveUntil && dto.effectiveUntil < dto.effectiveFrom) {
      throw new BadRequestException('Tanggal akhir appointment tidak boleh lebih awal dari tanggal mulai.');
    }
    if (dto.effectiveUntil && dto.effectiveUntil > academicYear.endDate) {
      throw new BadRequestException('Tanggal akhir appointment tidak boleh melewati tahun ajaran.');
    }
    if (dto.kind === 'PLT' && (!dto.effectiveUntil || !dto.reason)) {
      throw new BadRequestException('PLT memerlukan alasan dan tanggal akhir.');
    }

    return { staff, position, academicYear };
  }

  private async assertReplacementPlan(dto: CreateAppointmentDto): Promise<void> {
    const scopeWhere = this.scopeWhere(dto.positionId, dto.academicYearId, dto.majorId ?? null);
    const currentHolder = await this.prisma.appointment.findFirst({
      where: {
        ...scopeWhere,
        status: { in: [ACTIVE_CAPACITY_STATUS, SUSPENDED_STATUS] },
      },
      select: { id: true, status: true },
    });

    if (currentHolder && !dto.replacesAppointmentId) {
      throw new ConflictException('Scope jabatan sudah memiliki pemangku. Tentukan replacesAppointmentId untuk successor atau PLT.');
    }

    if (dto.replacesAppointmentId) {
      const replaced = await this.prisma.appointment.findUnique({
        where: { id: dto.replacesAppointmentId },
        select: {
          id: true,
          status: true,
          positionId: true,
          academicYearId: true,
          majorId: true,
        },
      });
      if (!replaced) throw new BadRequestException('Appointment pengganti tidak ditemukan.');
      if (!['ACTIVE', 'SUSPENDED'].includes(replaced.status)) {
        throw new ConflictException('Appointment yang digantikan harus ACTIVE atau SUSPENDED.');
      }
      if (!this.sameScope(dto, replaced)) {
        throw new BadRequestException('Appointment pengganti harus berada pada jabatan, tahun ajaran, dan scope yang sama.');
      }
      if (currentHolder && currentHolder.id !== replaced.id) {
        throw new ConflictException('replacesAppointmentId tidak cocok dengan pemangku aktif/suspended saat ini.');
      }

      const duplicateReplacement = await this.prisma.appointment.findFirst({
        where: {
          replacesAppointmentId: dto.replacesAppointmentId,
          status: { in: [...OPEN_REPLACEMENT_STATUSES] },
        },
        select: { id: true },
      });
      if (duplicateReplacement) {
        throw new ConflictException('Target appointment sudah memiliki kandidat successor atau PLT yang masih terbuka.');
      }
      return;
    }

    const preparedCandidate = await this.prisma.appointment.findFirst({
      where: {
        ...scopeWhere,
        status: { in: [...PREPARED_STATUSES] },
      },
      select: { id: true },
    });
    if (preparedCandidate) {
      throw new ConflictException('Scope jabatan sudah memiliki kandidat appointment yang masih terbuka.');
    }
  }

  private async assertNoActiveScopeConflict(appointment: AppointmentTransitionTarget): Promise<void> {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        ...this.scopeWhere(
          appointment.position.id,
          appointment.academicYearId,
          appointment.majorId,
        ),
        status: ACTIVE_CAPACITY_STATUS,
        id: { not: appointment.id },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException('Masih ada appointment ACTIVE pada jabatan/scope ini. Akhiri PLT atau pemangku aktif lain terlebih dahulu.');
    }
  }

  private async assertSubmitDoesNotDuplicateOpenCandidate(
    appointment: AppointmentTransitionTarget,
  ): Promise<void> {
    if (appointment.replacesAppointmentId) return;

    const conflict = await this.prisma.appointment.findFirst({
      where: {
        ...this.scopeWhere(
          appointment.position.id,
          appointment.academicYearId,
          appointment.majorId,
        ),
        status: { in: [...PREPARED_STATUSES] },
        replacesAppointmentId: null,
        id: { not: appointment.id },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException('Scope jabatan sudah memiliki kandidat appointment yang masih terbuka.');
    }
  }

  private assertSameScope(
    successor: AppointmentTransitionTarget,
    replaced: AppointmentTransitionTarget,
  ): void {
    const same =
      successor.position.id === replaced.position.id &&
      successor.academicYearId === replaced.academicYearId &&
      (successor.majorId ?? null) === (replaced.majorId ?? null);
    if (!same) {
      throw new BadRequestException('Successor dan appointment yang digantikan harus berada pada scope yang sama.');
    }
  }

  private sameScope(
    dto: CreateAppointmentDto,
    appointment: { positionId: string; academicYearId: string; majorId: string | null },
  ): boolean {
    return (
      dto.positionId === appointment.positionId &&
      dto.academicYearId === appointment.academicYearId &&
      (dto.majorId ?? null) === (appointment.majorId ?? null)
    );
  }

  private scopeWhere(positionId: string, academicYearId: string, majorId: string | null) {
    return {
      positionId,
      academicYearId,
      majorId,
    };
  }

  private async getTransitionTarget(id: string): Promise<AppointmentTransitionTarget> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        kind: true,
        academicYearId: true,
        majorId: true,
        effectiveFrom: true,
        effectiveUntil: true,
        reason: true,
        replacesAppointmentId: true,
        position: { select: { id: true, code: true, scopeType: true } },
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment tidak ditemukan.');
    return appointment;
  }

  private async updateStatus(
    id: string,
    staffKeycloakId: string,
    data: Prisma.AppointmentUpdateInput,
  ) {
    try {
      const result = await this.prisma.appointment.update({
        where: { id },
        data,
        select: { id: true, status: true, endedAt: true },
      });
      this.permissions.invalidateUser(staffKeycloakId);
      return result;
    } catch (error) {
      this.rethrowConstraint(error);
      throw error;
    }
  }

  private async assertCanPrepare(actor: AuthUser, targetPositionCode: string): Promise<void> {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    if (targetPositionCode === 'KEPALA_SEKOLAH') {
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat menyiapkan appointment Kepala Sekolah.');
    }

    if (await this.actorHasActiveKepalaSekolah(actor)) return;
    throw new ForbiddenException('Appointment hanya dapat disiapkan oleh SUPER_ADMIN atau Kepala Sekolah aktif.');
  }

  private async assertCanApprove(actor: AuthUser, targetPositionCode: string): Promise<void> {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    if (targetPositionCode === 'KEPALA_SEKOLAH') {
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat menyetujui appointment Kepala Sekolah.');
    }

    if (await this.actorHasActiveKepalaSekolah(actor)) return;
    throw new ForbiddenException('Appointment hanya dapat disetujui oleh SUPER_ADMIN atau Kepala Sekolah aktif.');
  }

  private async actorHasActiveKepalaSekolah(actor: AuthUser): Promise<boolean> {
    const positions = await this.permissions.getActivePositionCodes(actor.keycloakId);
    return positions.has('KEPALA_SEKOLAH');
  }

  private async requireActor(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId: actor.keycloakId },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Actor tidak ditemukan di database.');
    return user;
  }

  private today(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private rethrowConstraint(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Appointment live untuk jabatan/scope ini sudah ada.');
    }
  }
}
