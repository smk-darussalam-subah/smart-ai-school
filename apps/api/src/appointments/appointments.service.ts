import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, UserRole } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { getSchoolDate } from '../common/helpers/school-date.helper';
import {
  AppointmentCandidateQueryDto,
  AppointmentEndDto,
  AppointmentDecisionDto,
  AppointmentListQueryDto,
  AppointmentPermissionPreviewQueryDto,
  AppointmentSuspendDto,
  AppointmentSupersedeDto,
  CreateAppointmentDto,
} from './dto/appointment.dto';

const ELIGIBLE_APPOINTMENT_ROLES = new Set(['GURU', 'TATA_USAHA']);
const OPEN_REPLACEMENT_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] as const;
const OPEN_PLT_BLOCKING_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] as const;
const PREPARED_STATUSES = ['PENDING_APPROVAL', 'APPROVED'] as const;
const EXPIRABLE_PREPARED_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] as const;
const ACTIVE_CAPACITY_STATUS = 'ACTIVE' as const;
const SUSPENDED_STATUS = 'SUSPENDED' as const;
const EXPIRY_RECONCILIATION_STATUSES = [
  ...EXPIRABLE_PREPARED_STATUSES,
  ACTIVE_CAPACITY_STATUS,
  SUSPENDED_STATUS,
] as const;
const TERMINAL_STATUSES = ['ENDED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'] as const;

function isOperationalAppointmentStatus(status: string): boolean {
  return status === ACTIVE_CAPACITY_STATUS || status === SUSPENDED_STATUS;
}

export const APPOINTMENT_ACTIVATION_LOCK_KEY = 'appointment_due_activation' as const;
export const APPOINTMENT_ALLOWED_ACTIONS = [
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'CANCEL',
  'SUSPEND',
  'RESUME',
  'END',
  'SUPERSEDE',
  'CREATE_SUCCESSOR',
  'CREATE_PLT',
  'VIEW_HISTORY',
] as const;

type AppointmentAllowedAction = typeof APPOINTMENT_ALLOWED_ACTIONS[number];
type AppointmentSummaryKey =
  | 'all'
  | 'draft'
  | 'pendingApproval'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'terminal';
type AppointmentRegistrySummary = Record<AppointmentSummaryKey, number>;

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
  position: { id: string; code: string; scopeType: string; maxActiveHolders: number };
  staff: { id: string; userId: string; user: { keycloakId: string } };
};

type AppointmentTx = Prisma.TransactionClient;
type AppointmentActivationSummary = {
  endedCount: number;
  cancelledCount: number;
  activatedCount: number;
  affectedKeycloakIds: string[];
};
type AppointmentActivationSafeResponse = {
  endedCount: number;
  cancelledCount: number;
  activatedCount: number;
  affectedUserCount: number;
};

type AppointmentPolicyShape = {
  id: string;
  status: string;
  kind: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  replacesAppointmentId: string | null;
  position: { id: string; code: string; maxActiveHolders: number };
};

type AppointmentActorContext = {
  isSuperAdmin: boolean;
  isActiveKepalaSekolah: boolean;
};

type AppointmentLookupClient = Pick<AppointmentTx, 'appointment'>;
type AppointmentAuthorityClient = Pick<AppointmentTx, 'appointment' | 'academicYear' | 'user'>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async list(query: AppointmentListQueryDto, actor: AuthUser) {
    const schoolDate = getSchoolDate();
    const where = this.buildAppointmentWhere(query);
    const summaryWhere = this.buildAppointmentWhere({ ...query, status: undefined });
    const skip = (query.page - 1) * query.limit;
    const actorContext = await this.getActorContext(actor, schoolDate);

    const [data, total, summaryGroups] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: [
          { academicYear: { code: 'desc' } },
          { position: { sortOrder: 'asc' } },
          { effectiveFrom: 'desc' },
          { id: 'asc' },
        ],
        skip,
        take: query.limit,
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
          replacesAppointmentId: true,
          requestedByUserId: true,
          createdAt: true,
          staff: {
            select: {
              id: true,
              niy: true,
              employmentStatus: true,
              user: { select: { id: true, fullName: true, role: true } },
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              name: true,
              category: true,
              scopeType: true,
              maxActiveHolders: true,
            },
          },
          academicYear: { select: { id: true, code: true, isActive: true, startDate: true, endDate: true } },
          major: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: summaryWhere,
        _count: { _all: true },
      }),
    ]);

    const occupancy = await this.buildOccupancySnapshot(
      data.map((item) => ({
        positionId: item.position.id,
        academicYearId: item.academicYear.id,
        majorId: item.major?.id ?? null,
      })),
    );

    return {
      data: await Promise.all(data.map(async (item) => {
        const scopeKey = this.occupancyKey(item.position.id, item.academicYear.id, item.major?.id ?? null);
        return {
          ...item,
          staff: {
            id: item.staff.id,
            niy: item.staff.niy,
            employmentStatus: item.staff.employmentStatus,
            user: {
              id: item.staff.user.id,
              fullName: item.staff.user.fullName,
              role: item.staff.user.role,
            },
          },
          isEffectiveNow: this.isEffectiveAppointment(item, schoolDate),
          occupancy: occupancy.get(scopeKey) ?? {
            activeCount: 0,
            preparedCount: 0,
            capacity: item.position.maxActiveHolders,
          },
          allowedActions: this.resolveAllowedActions(item, actorContext, schoolDate),
        };
      })),
      total,
      page: query.page,
      limit: query.limit,
      summary: this.toRegistrySummary(summaryGroups),
    };
  }

  async getDetail(id: string, actor: AuthUser) {
    const schoolDate = getSchoolDate();
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
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
        supersededById: true,
        replacesAppointmentId: true,
        requestedByUserId: true,
        createdAt: true,
        updatedAt: true,
        staff: {
          select: {
            id: true,
            niy: true,
            employmentStatus: true,
            user: { select: { id: true, fullName: true, role: true } },
          },
        },
        position: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            scopeType: true,
            maxActiveHolders: true,
            permissions: { select: { permissionId: true } },
          },
        },
        academicYear: { select: { id: true, code: true, isActive: true, startDate: true, endDate: true } },
        major: { select: { id: true, code: true, name: true } },
        approvals: {
          orderBy: { createdAt: 'asc' },
          select: {
            decision: true,
            note: true,
            createdAt: true,
            approverUserId: true,
          },
        },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment tidak ditemukan.');

    const actorContext = await this.getActorContext(actor, schoolDate);
    const userIds = Array.from(new Set([
      appointment.requestedByUserId,
      ...appointment.approvals.map((approval) => approval.approverUserId),
    ].filter((value): value is string => Boolean(value))));
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const userNameById = new Map(users.map((user) => [user.id, user.fullName]));
    const permissionIds = appointment.position.permissions.map((permission) => permission.permissionId);
    const permissions = permissionIds.length > 0
      ? await this.prisma.permission.findMany({
          where: { id: { in: permissionIds } },
          orderBy: [{ module: 'asc' }, { code: 'asc' }],
          select: { code: true, description: true, module: true },
        })
      : [];

    const occupancy = await this.getOccupancyForScope(
      appointment.position.id,
      appointment.academicYear.id,
      appointment.major?.id ?? null,
      appointment.position.maxActiveHolders,
    );

    return {
      ...appointment,
      requestedBy: appointment.requestedByUserId
        ? { id: appointment.requestedByUserId, fullName: userNameById.get(appointment.requestedByUserId) ?? null }
        : null,
      approvals: appointment.approvals.map((approval) => ({
        decision: approval.decision,
        note: approval.note,
        createdAt: approval.createdAt,
        actorName: userNameById.get(approval.approverUserId) ?? null,
      })),
      permissions,
      occupancy,
      isEffectiveNow: this.isEffectiveAppointment(appointment, schoolDate),
      allowedActions: this.resolveAllowedActions(appointment, actorContext, schoolDate),
    };
  }

  async listEligibleCandidates(query: AppointmentCandidateQueryDto) {
    const where: Prisma.StaffWhereInput = {
      deletedAt: null,
      user: {
        deletedAt: null,
        isActive: true,
        role: query.role ?? { in: Array.from(ELIGIBLE_APPOINTMENT_ROLES) as UserRole[] },
      },
    };
    if (query.search) {
      where.OR = [
        { niy: { contains: query.search, mode: 'insensitive' } },
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.staff.findMany({
        where,
        orderBy: [{ user: { fullName: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          niy: true,
          employmentStatus: true,
          user: { select: { id: true, fullName: true, role: true, isActive: true } },
        },
      }),
      this.prisma.staff.count({ where }),
    ]);

    return {
      data: data.map((staff) => ({
        staffId: staff.id,
        userId: staff.user.id,
        fullName: staff.user.fullName,
        niy: staff.niy,
        stableRole: staff.user.role,
        employmentStatus: staff.employmentStatus,
        eligible: staff.user.isActive && ELIGIBLE_APPOINTMENT_ROLES.has(staff.user.role),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getPositionPreview(positionId: string, query: AppointmentPermissionPreviewQueryDto) {
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        scopeType: true,
        maxActiveHolders: true,
        permissions: { select: { permissionId: true } },
      },
    });
    if (!position) throw new NotFoundException('Jabatan tidak ditemukan.');
    await this.assertPreviewScope(position, query);

    const permissionIds = position.permissions.map((permission) => permission.permissionId);
    const permissions = permissionIds.length > 0
      ? await this.prisma.permission.findMany({
          where: { id: { in: permissionIds } },
          orderBy: [{ module: 'asc' }, { code: 'asc' }],
          select: { code: true, description: true, module: true },
        })
      : [];
    const occupancy = query.academicYearId
      ? await this.getOccupancyForScope(
          position.id,
          query.academicYearId,
          query.majorId ?? null,
          position.maxActiveHolders,
        )
      : null;

    return {
      position: {
        id: position.id,
        code: position.code,
        name: position.name,
        category: position.category,
        scopeType: position.scopeType,
        maxActiveHolders: position.maxActiveHolders,
      },
      permissions,
      occupancy,
      effectiveOnlyWhenActive: true,
    };
  }

  async getPositionCapabilities(actor: AuthUser) {
    const actorContext = await this.getActorContext(actor, getSchoolDate());
    const positions = await this.prisma.position.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    });
    return positions.map((position) => ({
      positionId: position.id,
      code: position.code,
      name: position.name,
      canPrepare: this.canPreparePosition(actorContext, position.code),
    }));
  }

  async createDraft(dto: CreateAppointmentDto, actor: AuthUser) {
    const schoolDate = getSchoolDate();
    const actorUser = await this.requireActor(actor);
    const context = await this.validateContext(dto, schoolDate);
    await this.assertCanPrepare(actor, context.position.code, schoolDate);
    await this.assertReplacementPlan(dto, context.position.maxActiveHolders);

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
    const transition = await this.withLifecycleLock(async (tx, _now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanPrepare(actor, appointment.position.code, schoolDate, tx);
      this.assertStatus(appointment.status, ['DRAFT'], 'Hanya appointment DRAFT yang dapat diajukan.');
      this.assertNotExpired(appointment, schoolDate, 'Appointment sudah melewati tanggal akhir.');
      await this.assertPltReplacementCanOperate(tx, appointment);
      await this.assertSubmitDoesNotDuplicateOpenCandidate(appointment, tx);
      await this.casAppointmentStatus(tx, id, ['DRAFT'], { status: 'PENDING_APPROVAL' });
      const result = { id, status: 'PENDING_APPROVAL' as const, endedAt: null };
      return { result, keycloakIds: [appointment.staff.user.keycloakId] };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async approve(id: string, dto: AppointmentDecisionDto, actor: AuthUser) {
    const actorUser = await this.requireActor(actor);
    const transition = await this.withLifecycleLock(async (tx, now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanApprove(actor, appointment.position.code, schoolDate, tx);
      this.assertStatus(
        appointment.status,
        ['PENDING_APPROVAL'],
        'Hanya appointment PENDING_APPROVAL yang dapat disetujui.',
      );
      this.assertNotExpired(appointment, schoolDate, 'Appointment sudah melewati tanggal akhir dan tidak dapat disetujui.');
      await this.assertPltReplacementCanOperate(tx, appointment);
      await this.casAppointmentStatus(tx, id, ['PENDING_APPROVAL'], {
        status: 'APPROVED',
        approvedAt: now,
      });
      await tx.appointmentApproval.create({
        data: {
          appointmentId: id,
          approverUserId: actorUser.id,
          decision: 'APPROVED',
          note: dto.note ?? null,
        },
      });
      const result = { id, status: 'APPROVED' as const, approvedAt: now };
      return { result, keycloakIds: [appointment.staff.user.keycloakId] };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async reject(id: string, dto: AppointmentDecisionDto, actor: AuthUser) {
    const actorUser = await this.requireActor(actor);
    const transition = await this.withLifecycleLock(async (tx, now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanApprove(actor, appointment.position.code, schoolDate, tx);
      this.assertStatus(
        appointment.status,
        ['PENDING_APPROVAL'],
        'Hanya appointment PENDING_APPROVAL yang dapat ditolak.',
      );
      await this.casAppointmentStatus(tx, id, ['PENDING_APPROVAL'], {
        status: 'REJECTED',
        endedAt: now,
      });
      await tx.appointmentApproval.create({
        data: {
          appointmentId: id,
          approverUserId: actorUser.id,
          decision: 'REJECTED',
          note: dto.note ?? null,
        },
      });
      const result = { id, status: 'REJECTED' as const, endedAt: now };
      return { result, keycloakIds: [appointment.staff.user.keycloakId] };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async cancel(id: string, actor: AuthUser) {
    const transition = await this.withLifecycleLock(async (tx, now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanPrepare(actor, appointment.position.code, schoolDate, tx);
      const allowed = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];
      this.assertStatus(appointment.status, allowed, 'Appointment ini tidak dapat dibatalkan.');
      await this.casAppointmentStatus(tx, id, allowed, { status: 'CANCELLED', endedAt: now });
      const result = { id, status: 'CANCELLED' as const, endedAt: now };
      return { result, keycloakIds: [appointment.staff.user.keycloakId] };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async suspend(id: string, dto: AppointmentSuspendDto, actor: AuthUser) {
    const transition = await this.withLifecycleLock(async (tx, now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanApprove(actor, appointment.position.code, schoolDate, tx);
      if (appointment.status !== ACTIVE_CAPACITY_STATUS || appointment.kind !== 'DEFINITIVE') {
        throw new ConflictException('Hanya appointment definitif ACTIVE yang dapat disuspend.');
      }
      this.assertNotExpired(appointment, schoolDate, 'Appointment sudah melewati tanggal akhir dan tidak dapat ditangguhkan.');
      if (dto.expectedReturnDate < appointment.effectiveFrom) {
        throw new BadRequestException('Tanggal kembali tidak boleh lebih awal dari tanggal mulai appointment.');
      }
      if (appointment.effectiveUntil && dto.expectedReturnDate > appointment.effectiveUntil) {
        throw new BadRequestException('Tanggal kembali tidak boleh melewati tanggal akhir appointment.');
      }
      await this.casAppointmentStatus(tx, id, [ACTIVE_CAPACITY_STATUS], {
        status: SUSPENDED_STATUS,
        suspendedAt: now,
        suspensionUntil: dto.expectedReturnDate,
        suspensionReason: dto.reason,
      });
      const result = { id, status: SUSPENDED_STATUS, endedAt: null };
      return { result, keycloakIds: [appointment.staff.user.keycloakId] };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async resume(id: string, actor: AuthUser) {
    const transition = await this.withLifecycleLock(async (tx, _now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanApprove(actor, appointment.position.code, schoolDate, tx);
      if (appointment.status !== SUSPENDED_STATUS || appointment.kind !== 'DEFINITIVE') {
        throw new ConflictException('Hanya appointment definitif SUSPENDED yang dapat dilanjutkan kembali.');
      }
      this.assertNotExpired(appointment, schoolDate, 'Appointment sudah melewati tanggal akhir dan tidak dapat dilanjutkan.');
      await this.assertCanResumeWithinCapacity(appointment, tx);
      await this.casAppointmentStatus(tx, id, [SUSPENDED_STATUS], {
        status: ACTIVE_CAPACITY_STATUS,
        suspensionUntil: null,
        suspensionReason: null,
      });
      const result = { id, status: ACTIVE_CAPACITY_STATUS, endedAt: null };
      return { result, keycloakIds: [appointment.staff.user.keycloakId] };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async end(id: string, dto: AppointmentEndDto, actor: AuthUser) {
    const transition = await this.withLifecycleLock(async (tx, now, schoolDate) => {
      const appointment = await this.getTransitionTarget(id, tx);
      await this.assertCanApprove(actor, appointment.position.code, schoolDate, tx);
      const allowed = ['ACTIVE', 'SUSPENDED', 'APPROVED'];
      this.assertStatus(
        appointment.status,
        allowed,
        'Hanya appointment ACTIVE, SUSPENDED, atau APPROVED yang dapat diakhiri.',
      );
      const effectiveUntil = dto.effectiveUntil ?? schoolDate;
      if (effectiveUntil < appointment.effectiveFrom) {
        throw new BadRequestException('Tanggal akhir tidak boleh lebih awal dari tanggal mulai appointment.');
      }
      await this.casAppointmentStatus(tx, id, allowed, {
        status: 'ENDED',
        effectiveUntil,
        endedAt: now,
        reason: dto.reason,
      });
      const affectedKeycloakIds = new Set<string>([appointment.staff.user.keycloakId]);
      if (appointment.kind === 'DEFINITIVE') {
        const childSummary = await this.terminateLinkedPlts(tx, [id], now);
        childSummary.affectedKeycloakIds.forEach((keycloakId) => affectedKeycloakIds.add(keycloakId));
      }
      const successorOutcome = await this.activateDueSuccessorInTransaction(tx, id, now, schoolDate);
      successorOutcome.affectedKeycloakIds.forEach((keycloakId) => affectedKeycloakIds.add(keycloakId));
      const result = { id, status: 'ENDED' as const, endedAt: now };
      return { result, keycloakIds: Array.from(affectedKeycloakIds) };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async supersede(id: string, dto: AppointmentSupersedeDto, actor: AuthUser) {
    const transition = await this.withLifecycleLock(async (tx, now, schoolDate) => {
      const successor = await this.getTransitionTarget(id, tx);
      await this.assertCanApprove(actor, successor.position.code, schoolDate, tx);
      this.assertStatus(successor.status, ['APPROVED'], 'Hanya successor APPROVED yang dapat diaktifkan.');
      if (!successor.replacesAppointmentId) {
        throw new BadRequestException('Supersede memerlukan replacesAppointmentId.');
      }
      if (successor.effectiveFrom > schoolDate) {
        throw new ConflictException('Appointment pengganti belum jatuh tempo. Aktivasi manual hanya boleh saat tanggal mulai sudah berlaku.');
      }
      this.assertNotExpired(successor, schoolDate, 'Appointment pengganti sudah melewati tanggal akhir.');
      const replaced = await this.getTransitionTarget(successor.replacesAppointmentId, tx);
      this.assertReplacementScope(successor, replaced);
      const affectedKeycloakIds = new Set<string>([
        successor.staff.user.keycloakId,
        replaced.staff.user.keycloakId,
      ]);

      if (successor.kind === 'PLT') {
        if (replaced.status !== SUSPENDED_STATUS) {
          throw new ConflictException('PLT hanya dapat aktif saat appointment definitif sedang SUSPENDED.');
        }
        await this.casAppointmentStatus(tx, id, ['APPROVED'], {
          status: ACTIVE_CAPACITY_STATUS,
          activatedAt: now,
          reason: dto.reason ?? successor.reason,
        });
      } else {
        if (replaced.academicYearId === successor.academicYearId) {
          this.assertStatus(
            replaced.status,
            ['ACTIVE', 'SUSPENDED'],
            'Appointment yang digantikan harus ACTIVE atau SUSPENDED.',
          );
          await this.casAppointmentStatus(tx, replaced.id, ['ACTIVE', 'SUSPENDED'], {
            status: 'SUPERSEDED',
            supersededById: successor.id,
            endedAt: now,
            reason: dto.reason ?? replaced.reason,
          });
          if (replaced.kind === 'DEFINITIVE') {
            const childSummary = await this.terminateLinkedPlts(tx, [replaced.id], now);
            childSummary.affectedKeycloakIds.forEach((keycloakId) => affectedKeycloakIds.add(keycloakId));
          }
        } else if (!['ACTIVE', 'SUSPENDED', 'ENDED', 'SUPERSEDED'].includes(replaced.status)) {
          throw new ConflictException('Appointment tahun sebelumnya belum berada pada status yang dapat digantikan.');
        }
        await this.casAppointmentStatus(tx, id, ['APPROVED'], {
          status: ACTIVE_CAPACITY_STATUS,
          activatedAt: now,
          reason: dto.reason ?? successor.reason,
        });
      }

      const result = { id, status: ACTIVE_CAPACITY_STATUS, activatedAt: now };
      return { result, keycloakIds: Array.from(affectedKeycloakIds) };
    });
    this.invalidateUsers(transition.keycloakIds);
    return transition.result;
  }

  async applyAcademicYearActivation(
    tx: AppointmentTx,
    params: { yearId: string; oldYearId: string | null; now?: Date },
  ): Promise<AppointmentActivationSummary> {
    const affectedKeycloakIds = new Set<string>();
    const now = params.now ?? new Date();
    const schoolDate = getSchoolDate(now);
    let endedCount = 0;
    let cancelledCount = 0;
    let activatedCount = 0;

    if (params.oldYearId) {
      const oldOperationalAppointments = await tx.appointment.findMany({
        where: {
          academicYearId: params.oldYearId,
          status: { in: [ACTIVE_CAPACITY_STATUS, SUSPENDED_STATUS] },
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          kind: true,
          staff: { select: { user: { select: { keycloakId: true } } } },
        },
      });
      const endedDefinitiveIds: string[] = [];
      for (const appointment of oldOperationalAppointments) {
        await this.casAppointmentStatus(tx, appointment.id, [ACTIVE_CAPACITY_STATUS, SUSPENDED_STATUS], {
          status: 'ENDED',
          endedAt: now,
          reason: 'Tahun ajaran berganti',
        });
        affectedKeycloakIds.add(appointment.staff.user.keycloakId);
        endedCount += 1;
        if (appointment.kind === 'DEFINITIVE') endedDefinitiveIds.push(appointment.id);
      }
      const linkedPltSummary = await this.terminateLinkedPlts(tx, endedDefinitiveIds, now);
      endedCount += linkedPltSummary.endedCount;
      cancelledCount += linkedPltSummary.cancelledCount;
      for (const keycloakId of linkedPltSummary.affectedKeycloakIds) {
        affectedKeycloakIds.add(keycloakId);
      }

      const oldPreparedAppointments = await tx.appointment.findMany({
        where: {
          academicYearId: params.oldYearId,
          status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          staff: { select: { user: { select: { keycloakId: true } } } },
        },
      });
      for (const appointment of oldPreparedAppointments) {
        await this.casAppointmentStatus(tx, appointment.id, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'], {
          status: 'CANCELLED',
          endedAt: now,
          reason: 'Tahun ajaran berakhir sebelum appointment aktif',
        });
        affectedKeycloakIds.add(appointment.staff.user.keycloakId);
        cancelledCount += 1;
      }
    }

    const expirySummary = await this.reconcileExpiredAppointments(
      tx,
      params.yearId,
      now,
      schoolDate,
    );
    endedCount += expirySummary.endedCount;
    cancelledCount += expirySummary.cancelledCount;
    for (const keycloakId of expirySummary.affectedKeycloakIds) {
      affectedKeycloakIds.add(keycloakId);
    }

    const readyAppointments = await tx.appointment.findMany({
      where: {
        academicYearId: params.yearId,
        status: 'APPROVED',
        effectiveFrom: { lte: schoolDate },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: schoolDate } },
        ],
      },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        kind: true,
        academicYearId: true,
        replacesAppointmentId: true,
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });

    for (const appointment of readyAppointments) {
      const replacementSummary = await this.supersedeCurrentYearIncumbentIfNeeded(tx, appointment, now);
      replacementSummary.affectedKeycloakIds.forEach((keycloakId) => affectedKeycloakIds.add(keycloakId));
      endedCount += replacementSummary.endedCount;
      cancelledCount += replacementSummary.cancelledCount;
      await this.activateApprovedAppointmentInTransaction(tx, appointment.id, now);
      affectedKeycloakIds.add(appointment.staff.user.keycloakId);
      activatedCount += 1;
    }

    return {
      endedCount,
      cancelledCount,
      activatedCount,
      affectedKeycloakIds: Array.from(affectedKeycloakIds),
    };
  }

  private async reconcileExpiredAppointments(
    tx: AppointmentTx,
    yearId: string,
    now: Date,
    schoolDate: Date,
  ): Promise<Omit<AppointmentActivationSummary, 'activatedCount'>> {
    const stalePltSummary = await this.reconcilePltsWithTerminalParents(tx, yearId, now);
    const openAppointments = await tx.appointment.findMany({
      where: {
        academicYearId: yearId,
        status: { in: [...EXPIRY_RECONCILIATION_STATUSES] },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        kind: true,
        status: true,
        effectiveUntil: true,
        replacesAppointmentId: true,
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });

    const directlyExpiredOperationalIds = new Set(
      openAppointments
        .filter((appointment) =>
          isOperationalAppointmentStatus(appointment.status)
          && appointment.effectiveUntil !== null
          && appointment.effectiveUntil < schoolDate)
        .map((appointment) => appointment.id),
    );
    const endedIds = new Set(directlyExpiredOperationalIds);
    const cancelledIds = new Set(
      openAppointments
        .filter((appointment) =>
          EXPIRABLE_PREPARED_STATUSES.some((status) => status === appointment.status)
          && appointment.effectiveUntil !== null
          && appointment.effectiveUntil < schoolDate)
        .map((appointment) => appointment.id),
    );

    let endedCount = stalePltSummary.endedCount;
    let cancelledCount = stalePltSummary.cancelledCount;
    const affectedKeycloakIds = new Set<string>(stalePltSummary.affectedKeycloakIds);
    const appointmentById = new Map(openAppointments.map((appointment) => [appointment.id, appointment]));
    const endedDefinitiveIds: string[] = [];

    for (const id of Array.from(endedIds).sort()) {
      const appointment = appointmentById.get(id);
      if (!appointment) continue;
      const ended = await tx.appointment.updateMany({
        where: {
          id,
          status: { in: [ACTIVE_CAPACITY_STATUS, SUSPENDED_STATUS] },
        },
        data: {
          status: 'ENDED',
          endedAt: now,
          reason: directlyExpiredOperationalIds.has(id)
            ? 'Masa berlaku appointment berakhir'
            : 'Appointment definitif berakhir',
        },
      });
      if (ended.count === 1) {
        endedCount += 1;
        affectedKeycloakIds.add(appointment.staff.user.keycloakId);
        if (appointment.kind === 'DEFINITIVE') endedDefinitiveIds.push(appointment.id);
      }
    }

    const linkedPltSummary = await this.terminateLinkedPlts(tx, endedDefinitiveIds, now);
    endedCount += linkedPltSummary.endedCount;
    cancelledCount += linkedPltSummary.cancelledCount;
    for (const keycloakId of linkedPltSummary.affectedKeycloakIds) {
      affectedKeycloakIds.add(keycloakId);
    }

    for (const id of Array.from(cancelledIds).sort()) {
      const appointment = appointmentById.get(id);
      if (!appointment) continue;
      const cancelled = await tx.appointment.updateMany({
        where: {
          id,
          status: { in: [...EXPIRABLE_PREPARED_STATUSES] },
        },
        data: {
          status: 'CANCELLED',
          endedAt: now,
          reason: 'Masa berlaku appointment berakhir sebelum aktivasi',
        },
      });
      if (cancelled.count === 1) {
        cancelledCount += 1;
        affectedKeycloakIds.add(appointment.staff.user.keycloakId);
      }
    }

    return {
      endedCount,
      cancelledCount,
      affectedKeycloakIds: Array.from(affectedKeycloakIds),
    };
  }

  private async reconcilePltsWithTerminalParents(
    tx: AppointmentTx,
    yearId: string,
    now: Date,
  ): Promise<Omit<AppointmentActivationSummary, 'activatedCount'>> {
    const openPlts = await tx.appointment.findMany({
      where: {
        academicYearId: yearId,
        kind: 'PLT',
        status: { in: [...EXPIRY_RECONCILIATION_STATUSES] },
        replacesAppointmentId: { not: null },
      },
      select: { replacesAppointmentId: true },
    });
    const parentIds = Array.from(new Set(
      openPlts.flatMap((appointment) => appointment.replacesAppointmentId
        ? [appointment.replacesAppointmentId]
        : []),
    ));
    if (parentIds.length === 0) {
      return { endedCount: 0, cancelledCount: 0, affectedKeycloakIds: [] };
    }
    const terminalParents = await tx.appointment.findMany({
      where: {
        id: { in: parentIds },
        kind: 'DEFINITIVE',
        status: { in: [...TERMINAL_STATUSES] },
      },
      select: { id: true },
    });
    return this.terminateLinkedPlts(tx, terminalParents.map((appointment) => appointment.id), now);
  }

  private async terminateLinkedPlts(
    tx: AppointmentTx,
    parentIds: string[],
    now: Date,
  ): Promise<Omit<AppointmentActivationSummary, 'activatedCount'>> {
    if (parentIds.length === 0) {
      return { endedCount: 0, cancelledCount: 0, affectedKeycloakIds: [] };
    }
    const linkedPlts = await tx.appointment.findMany({
      where: {
        replacesAppointmentId: { in: parentIds },
        kind: 'PLT',
        status: { in: [...EXPIRY_RECONCILIATION_STATUSES] },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });
    let endedCount = 0;
    let cancelledCount = 0;
    const affectedKeycloakIds = new Set<string>();
    for (const appointment of linkedPlts) {
      if (isOperationalAppointmentStatus(appointment.status)) {
        await this.casAppointmentStatus(tx, appointment.id, [ACTIVE_CAPACITY_STATUS, SUSPENDED_STATUS], {
          status: 'ENDED',
          endedAt: now,
          reason: 'Appointment definitif berakhir',
        });
        endedCount += 1;
      } else {
        await this.casAppointmentStatus(tx, appointment.id, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'], {
          status: 'CANCELLED',
          endedAt: now,
          reason: 'Appointment definitif berakhir sebelum PLT aktif',
        });
        cancelledCount += 1;
      }
      affectedKeycloakIds.add(appointment.staff.user.keycloakId);
    }
    return { endedCount, cancelledCount, affectedKeycloakIds: Array.from(affectedKeycloakIds) };
  }

  async acquireActivationLock(tx: AppointmentTx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`;
  }

  async activateDueAppointments(): Promise<AppointmentActivationSafeResponse> {
    const summary = await this.prisma.$transaction(async (tx) => {
      await this.acquireActivationLock(tx);
      const now = new Date();
      const year = await tx.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!year) throw new NotFoundException('Tahun ajaran aktif tidak ditemukan.');
      return this.applyAcademicYearActivation(tx, { yearId: year.id, oldYearId: null, now });
    }).catch((error) => {
      this.rethrowConstraint(error);
      throw error;
    });

    for (const keycloakId of summary.affectedKeycloakIds) {
      this.permissions.invalidateUser(keycloakId);
    }
    return {
      endedCount: summary.endedCount,
      cancelledCount: summary.cancelledCount,
      activatedCount: summary.activatedCount,
      affectedUserCount: summary.affectedKeycloakIds.length,
    };
  }

  private async activateDueSuccessorInTransaction(
    tx: AppointmentTx,
    endedAppointmentId: string,
    now: Date,
    schoolDate: Date,
  ): Promise<{
    successor: { staff: { user: { keycloakId: string } } } | null;
    affectedKeycloakIds: string[];
  }> {
    const affectedKeycloakIds = new Set<string>();
    const expiredSuccessors = await tx.appointment.findMany({
      where: {
        replacesAppointmentId: endedAppointmentId,
        status: 'APPROVED',
        kind: 'DEFINITIVE',
        effectiveUntil: { lt: schoolDate },
      },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });
    for (const expiredSuccessor of expiredSuccessors) {
      await this.casAppointmentStatus(tx, expiredSuccessor.id, ['APPROVED'], {
        status: 'CANCELLED',
        endedAt: now,
        reason: 'Masa berlaku successor berakhir sebelum aktivasi',
      });
      affectedKeycloakIds.add(expiredSuccessor.staff.user.keycloakId);
    }

    const successor = await tx.appointment.findFirst({
      where: {
        replacesAppointmentId: endedAppointmentId,
        status: 'APPROVED',
        kind: 'DEFINITIVE',
        effectiveFrom: { lte: schoolDate },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: schoolDate } },
        ],
      },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });
    if (!successor) return { successor: null, affectedKeycloakIds: Array.from(affectedKeycloakIds) };
    await this.activateApprovedAppointmentInTransaction(tx, successor.id, now);
    affectedKeycloakIds.add(successor.staff.user.keycloakId);
    return { successor, affectedKeycloakIds: Array.from(affectedKeycloakIds) };
  }

  private async supersedeCurrentYearIncumbentIfNeeded(
    tx: AppointmentTx,
    appointment: {
      id: string;
      kind: string;
      academicYearId: string;
      replacesAppointmentId: string | null;
    },
    now: Date,
  ): Promise<Omit<AppointmentActivationSummary, 'activatedCount'>> {
    const emptySummary = { endedCount: 0, cancelledCount: 0, affectedKeycloakIds: [] };
    if (!appointment.replacesAppointmentId) {
      if (appointment.kind === 'PLT') {
        throw new ConflictException('PLT memerlukan appointment definitif yang sedang ditangguhkan.');
      }
      return emptySummary;
    }
    const replaced = await tx.appointment.findUnique({
      where: { id: appointment.replacesAppointmentId },
      select: {
        id: true,
        status: true,
        kind: true,
        academicYearId: true,
        staff: { select: { user: { select: { keycloakId: true } } } },
      },
    });
    if (!replaced) return emptySummary;
    if (appointment.kind === 'PLT') {
      if (replaced.academicYearId !== appointment.academicYearId) {
        throw new ConflictException('PLT harus berada pada tahun ajaran yang sama dengan appointment definitif.');
      }
      if (replaced.kind !== 'DEFINITIVE' || replaced.status !== SUSPENDED_STATUS) {
        throw new ConflictException('PLT hanya dapat aktif saat appointment definitif sedang SUSPENDED.');
      }
      return {
        endedCount: 0,
        cancelledCount: 0,
        affectedKeycloakIds: [replaced.staff.user.keycloakId],
      };
    }
    if (replaced.academicYearId !== appointment.academicYearId) return emptySummary;
    if (!['ACTIVE', 'SUSPENDED'].includes(replaced.status)) return emptySummary;

    await this.casAppointmentStatus(tx, replaced.id, ['ACTIVE', 'SUSPENDED'], {
      status: 'SUPERSEDED',
      supersededById: appointment.id,
      endedAt: now,
    });
    const affectedKeycloakIds = new Set<string>([replaced.staff.user.keycloakId]);
    if (replaced.kind === 'DEFINITIVE') {
      const childSummary = await this.terminateLinkedPlts(tx, [replaced.id], now);
      childSummary.affectedKeycloakIds.forEach((keycloakId) => affectedKeycloakIds.add(keycloakId));
      return {
        endedCount: childSummary.endedCount,
        cancelledCount: childSummary.cancelledCount,
        affectedKeycloakIds: Array.from(affectedKeycloakIds),
      };
    }
    return { endedCount: 0, cancelledCount: 0, affectedKeycloakIds: Array.from(affectedKeycloakIds) };
  }

  private async activateApprovedAppointmentInTransaction(
    tx: AppointmentTx,
    appointmentId: string,
    now: Date,
  ): Promise<void> {
    await this.casAppointmentStatus(tx, appointmentId, ['APPROVED'], {
      status: ACTIVE_CAPACITY_STATUS,
      activatedAt: now,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Wave C: History endpoint
  // ════════════════════════════════════════════════════════════════════════════

  /** Riwayat bisnis appointment dari appointment, approval records, dan AuditLog aman. */
  async getHistory(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        effectiveFrom: true,
        effectiveUntil: true,
        createdAt: true,
        requestedByUserId: true,
        approvedAt: true,
        activatedAt: true,
        suspendedAt: true,
        suspensionReason: true,
        endedAt: true,
        reason: true,
        supersededById: true,
        position: { select: { code: true, name: true } },
        academicYear: { select: { code: true } },
        staff: { select: { user: { select: { fullName: true } } } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment tidak ditemukan.');

    const approvals = await this.prisma.appointmentApproval.findMany({
      where: { appointmentId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        decision: true,
        note: true,
        createdAt: true,
        approverUserId: true,
      },
    });

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        resourceType: 'appointment',
        OR: [
          { resourceId: id },
          ...(appointment.supersededById
            ? [{
                action: 'appointment.supersede',
                outcome: 'success',
                resourceId: appointment.supersededById,
              }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        action: true,
        outcome: true,
        actorId: true,
        resourceId: true,
      },
    });

    const actorUserIds = Array.from(new Set([
      appointment.requestedByUserId,
      ...approvals.map((approval) => approval.approverUserId),
    ].filter((value): value is string => Boolean(value))));
    const actorKeycloakIds = Array.from(new Set(
      auditLogs.map((log) => log.actorId).filter((value): value is string => Boolean(value)),
    ));
    const actorUsers = actorUserIds.length > 0 || actorKeycloakIds.length > 0
      ? await this.prisma.user.findMany({
          where: {
            OR: [
              ...(actorUserIds.length > 0 ? [{ id: { in: actorUserIds } }] : []),
              ...(actorKeycloakIds.length > 0 ? [{ keycloakId: { in: actorKeycloakIds } }] : []),
            ],
          },
          select: { id: true, keycloakId: true, fullName: true },
        })
      : [];
    const nameByUserId = new Map(actorUsers.map((user) => [user.id, user.fullName]));
    const nameByKeycloakId = new Map(actorUsers.map((user) => [user.keycloakId, user.fullName]));
    const successfulAudits = auditLogs.filter((log) => log.outcome === 'success');
    const auditActorName = (log: { actorId: string | null } | null) =>
      log?.actorId ? nameByKeycloakId.get(log.actorId) ?? null : null;
    const hasSuccessfulAudit = (action: string) =>
      successfulAudits.some((log) => log.action === action);
    const latestSuspendAudit = [...successfulAudits]
      .reverse()
      .find((log) => log.action === 'appointment.suspend') ?? null;
    const ownActivationAudit = successfulAudits.find((log) =>
      log.action === 'appointment.supersede' && log.resourceId === id,
    ) ?? null;
    const supersedingAudit = appointment.supersededById
      ? successfulAudits.find((log) =>
          log.action === 'appointment.supersede' && log.resourceId === appointment.supersededById,
        ) ?? null
      : null;
    const auditEvent = (log: typeof successfulAudits[number]) => {
      switch (log.action) {
        case 'appointment.submit':
          return {
            action: 'SUBMITTED',
            label: 'Diajukan',
            occurredAt: log.createdAt,
            actorName: auditActorName(log),
            outcome: 'success' as const,
            note: null,
          };
        case 'appointment.suspend':
          return {
            action: 'SUSPENDED',
            label: 'Ditangguhkan',
            occurredAt: log.createdAt,
            actorName: auditActorName(log),
            outcome: 'success' as const,
            note: appointment.status === SUSPENDED_STATUS && latestSuspendAudit === log
              ? appointment.suspensionReason
              : null,
          };
        case 'appointment.resume':
          return {
            action: 'RESUMED',
            label: 'Dilanjutkan',
            occurredAt: log.createdAt,
            actorName: auditActorName(log),
            outcome: 'success' as const,
            note: null,
          };
        case 'appointment.cancel':
          return {
            action: 'CANCELLED',
            label: 'Dibatalkan',
            occurredAt: log.createdAt,
            actorName: auditActorName(log),
            outcome: 'success' as const,
            note: null,
          };
        case 'appointment.end':
          return {
            action: 'ENDED',
            label: 'Diakhiri',
            occurredAt: log.createdAt,
            actorName: auditActorName(log),
            outcome: 'success' as const,
            note: appointment.status === 'ENDED' ? appointment.reason : null,
          };
        default:
          return null;
      }
    };
    const lifecycleAuditTimeline = successfulAudits
      .map(auditEvent)
      .filter((item): item is NonNullable<ReturnType<typeof auditEvent>> => item !== null);

    const timeline = [
      {
        action: 'CREATED',
        label: 'Draft dibuat',
        occurredAt: appointment.createdAt,
        actorName: appointment.requestedByUserId
          ? nameByUserId.get(appointment.requestedByUserId) ?? null
          : null,
        outcome: 'success' as const,
        note: null,
      },
      ...lifecycleAuditTimeline,
      ...approvals.map((approval) => ({
        action: approval.decision,
        label: approval.decision === 'APPROVED' ? 'Disetujui' : 'Ditolak',
        occurredAt: approval.createdAt,
        actorName: nameByUserId.get(approval.approverUserId) ?? null,
        outcome: 'success' as const,
        note: approval.note,
      })),
      ...(appointment.activatedAt
        ? [{
            action: 'ACTIVATED',
            label: 'Diaktifkan',
            occurredAt: appointment.activatedAt,
            actorName: auditActorName(ownActivationAudit) ?? 'Sistem',
            outcome: 'success' as const,
            note: null,
          }]
        : []),
      ...(appointment.suspendedAt && !hasSuccessfulAudit('appointment.suspend')
        ? [{
            action: 'SUSPENDED',
            label: 'Ditangguhkan',
            occurredAt: appointment.suspendedAt,
            actorName: null,
            outcome: 'success' as const,
            note: appointment.suspensionReason,
          }]
        : []),
      ...(appointment.endedAt && appointment.status === 'CANCELLED' && !hasSuccessfulAudit('appointment.cancel')
        ? [{
            action: 'CANCELLED',
            label: 'Dibatalkan',
            occurredAt: appointment.endedAt,
            actorName: null,
            outcome: 'success' as const,
            note: null,
          }]
        : []),
      ...(appointment.endedAt && appointment.status === 'ENDED' && !hasSuccessfulAudit('appointment.end')
        ? [{
            action: 'ENDED',
            label: 'Diakhiri',
            occurredAt: appointment.endedAt,
            actorName: null,
            outcome: 'success' as const,
            note: appointment.reason,
          }]
        : []),
      ...(appointment.endedAt && appointment.status === 'SUPERSEDED'
        ? [{
            action: 'SUPERSEDED',
            label: 'Digantikan',
            occurredAt: appointment.endedAt,
            actorName: auditActorName(supersedingAudit) ?? 'Sistem',
            outcome: 'success' as const,
            note: appointment.reason,
          }]
        : []),
      ...auditLogs
        .filter((log) => log.outcome === 'failure')
        .map((log) => ({
          action: log.action,
          label: this.historyAuditLabel(log.action),
          occurredAt: log.createdAt,
          actorName: log.actorId ? nameByKeycloakId.get(log.actorId) ?? null : null,
          outcome: 'failure' as const,
          note: 'Aksi tidak berhasil. Lihat status terkini sebelum mencoba lagi.',
        })),
    ].sort((a, b) => {
      const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
      return byTime === 0 ? a.action.localeCompare(b.action) : byTime;
    });

    return {
      appointmentId: id,
      appointment: {
        id: appointment.id,
        status: appointment.status,
        staffName: appointment.staff.user.fullName,
        position: appointment.position,
        academicYear: appointment.academicYear,
        effectiveFrom: appointment.effectiveFrom,
        effectiveUntil: appointment.effectiveUntil,
      },
      timeline: timeline.map((item) => ({
        ...item,
        actorName: item.actorName ?? null,
        note: item.note ?? null,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Validation helpers
  // ════════════════════════════════════════════════════════════════════════════

  private buildAppointmentWhere(query: Partial<AppointmentListQueryDto>): Prisma.AppointmentWhereInput {
    const where: Prisma.AppointmentWhereInput = {};
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.status) where.status = { in: query.status };
    if (query.positionId) where.positionId = query.positionId;
    if (query.majorId) where.majorId = query.majorId;
    if (query.kind) where.kind = query.kind;
    if (query.search) {
      where.OR = [
        { staff: { niy: { contains: query.search, mode: 'insensitive' } } },
        { staff: { user: { fullName: { contains: query.search, mode: 'insensitive' } } } },
        { position: { code: { contains: query.search, mode: 'insensitive' } } },
        { position: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  private toRegistrySummary(
    groups: Array<{ status: string; _count: { _all: number } }>,
  ): AppointmentRegistrySummary {
    const summary: AppointmentRegistrySummary = {
      all: 0,
      draft: 0,
      pendingApproval: 0,
      approved: 0,
      active: 0,
      suspended: 0,
      terminal: 0,
    };
    for (const group of groups) {
      const count = group._count._all;
      summary.all += count;
      if (group.status === 'DRAFT') summary.draft += count;
      if (group.status === 'PENDING_APPROVAL') summary.pendingApproval += count;
      if (group.status === 'APPROVED') summary.approved += count;
      if (group.status === ACTIVE_CAPACITY_STATUS) summary.active += count;
      if (group.status === SUSPENDED_STATUS) summary.suspended += count;
      if ((TERMINAL_STATUSES as readonly string[]).includes(group.status)) summary.terminal += count;
    }
    return summary;
  }

  private async buildOccupancySnapshot(
    scopes: Array<{ positionId: string; academicYearId: string; majorId: string | null }>,
  ): Promise<Map<string, { activeCount: number; preparedCount: number; capacity: number }>> {
    const uniqueScopes = Array.from(new Map(scopes.map((scope) => [
      this.occupancyKey(scope.positionId, scope.academicYearId, scope.majorId),
      scope,
    ])).values());
    const map = new Map<string, { activeCount: number; preparedCount: number; capacity: number }>();
    if (uniqueScopes.length === 0) return map;

    const rows = await this.prisma.appointment.findMany({
      where: {
        OR: uniqueScopes.map((scope) => ({
          positionId: scope.positionId,
          academicYearId: scope.academicYearId,
          majorId: scope.majorId,
        })),
        status: { in: ['PENDING_APPROVAL', 'APPROVED', ACTIVE_CAPACITY_STATUS] },
      },
      select: {
        positionId: true,
        academicYearId: true,
        majorId: true,
        status: true,
        position: { select: { maxActiveHolders: true } },
      },
    });

    for (const row of rows) {
      const key = this.occupancyKey(row.positionId, row.academicYearId, row.majorId);
      const current = map.get(key) ?? {
        activeCount: 0,
        preparedCount: 0,
        capacity: row.position.maxActiveHolders,
      };
      if (row.status === ACTIVE_CAPACITY_STATUS) current.activeCount += 1;
      if ((PREPARED_STATUSES as readonly string[]).includes(row.status)) current.preparedCount += 1;
      current.capacity = row.position.maxActiveHolders;
      map.set(key, current);
    }
    return map;
  }

  private async getOccupancyForScope(
    positionId: string,
    academicYearId: string,
    majorId: string | null,
    capacity: number,
  ) {
    const [activeCount, preparedCount] = await Promise.all([
      this.prisma.appointment.count({
        where: { positionId, academicYearId, majorId, status: ACTIVE_CAPACITY_STATUS },
      }),
      this.prisma.appointment.count({
        where: {
          positionId,
          academicYearId,
          majorId,
          status: { in: [...PREPARED_STATUSES] },
        },
      }),
    ]);
    return { activeCount, preparedCount, capacity };
  }

  private async assertPreviewScope(
    position: { id: string; scopeType: string },
    query: AppointmentPermissionPreviewQueryDto,
  ): Promise<void> {
    if (!query.academicYearId) {
      if (query.majorId) throw new BadRequestException('Preview jurusan memerlukan tahun ajaran.');
      return;
    }

    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: query.academicYearId },
      select: { id: true },
    });
    if (!academicYear) throw new BadRequestException('Tahun ajaran tidak ditemukan.');

    if (position.scopeType === 'MAJOR' && !query.majorId) {
      throw new BadRequestException('Jabatan ini memerlukan jurusan untuk preview occupancy.');
    }
    if (position.scopeType !== 'MAJOR' && query.majorId) {
      throw new BadRequestException('Jabatan ini tidak menggunakan jurusan.');
    }
    if (query.majorId) {
      const major = await this.prisma.major.findUnique({
        where: { id: query.majorId },
        select: { id: true, isActive: true },
      });
      if (!major || !major.isActive) throw new BadRequestException('Jurusan tidak ditemukan atau tidak aktif.');
    }
  }

  private occupancyKey(positionId: string, academicYearId: string, majorId: string | null): string {
    return `${positionId}:${academicYearId}:${majorId ?? 'school'}`;
  }

  private async getActorContext(
    actor: AuthUser,
    schoolDate: Date = getSchoolDate(),
    client?: AppointmentAuthorityClient,
  ): Promise<AppointmentActorContext> {
    const isSuperAdmin = actor.roles.includes('SUPER_ADMIN');
    if (isSuperAdmin) return { isSuperAdmin: true, isActiveKepalaSekolah: false };
    const isActiveKepalaSekolah =
      actor.roles.includes('KEPALA_SEKOLAH' as UserRole) ||
      (client
        ? await this.actorHasActiveKepalaSekolahInTransaction(client, actor, schoolDate)
        : await this.actorHasActiveKepalaSekolah(actor, schoolDate));
    return { isSuperAdmin: false, isActiveKepalaSekolah };
  }

  private canPreparePosition(
    actorContext: AppointmentActorContext,
    targetPositionCode: string,
  ): boolean {
    if (actorContext.isSuperAdmin) return true;
    if (targetPositionCode === 'KEPALA_SEKOLAH') return false;
    return actorContext.isActiveKepalaSekolah;
  }

  private canApprovePosition(
    actorContext: AppointmentActorContext,
    targetPositionCode: string,
  ): boolean {
    return this.canPreparePosition(actorContext, targetPositionCode);
  }

  private resolveAllowedActions(
    appointment: AppointmentPolicyShape,
    actorContext: AppointmentActorContext,
    schoolDate: Date,
  ): AppointmentAllowedAction[] {
    const actions = new Set<AppointmentAllowedAction>(['VIEW_HISTORY']);
    const canPrepare = this.canPreparePosition(actorContext, appointment.position.code);
    const canApprove = this.canApprovePosition(actorContext, appointment.position.code);
    const due = appointment.effectiveFrom <= schoolDate &&
      (!appointment.effectiveUntil || appointment.effectiveUntil >= schoolDate);

    if (appointment.status === 'DRAFT' && canPrepare) {
      actions.add('SUBMIT');
      actions.add('CANCEL');
    }
    if (appointment.status === 'PENDING_APPROVAL') {
      if (canApprove) {
        actions.add('APPROVE');
        actions.add('REJECT');
      }
      if (canPrepare) actions.add('CANCEL');
    }
    if (appointment.status === 'APPROVED') {
      if (canPrepare) actions.add('CANCEL');
      if (canApprove && due && appointment.replacesAppointmentId) actions.add('SUPERSEDE');
    }
    if (appointment.status === ACTIVE_CAPACITY_STATUS && canApprove) {
      actions.add('END');
      if (appointment.kind === 'DEFINITIVE') {
        actions.add('SUSPEND');
        actions.add('CREATE_SUCCESSOR');
      }
    }
    if (appointment.status === SUSPENDED_STATUS && canApprove && appointment.kind === 'DEFINITIVE') {
      actions.add('RESUME');
      actions.add('END');
      actions.add('CREATE_PLT');
    }
    return Array.from(actions);
  }

  private isEffectiveAppointment(
    appointment: { status: string; effectiveFrom: Date; effectiveUntil: Date | null },
    today: Date,
  ): boolean {
    return (
      appointment.status === ACTIVE_CAPACITY_STATUS &&
      appointment.effectiveFrom <= today &&
      (!appointment.effectiveUntil || appointment.effectiveUntil >= today)
    );
  }

  private historyAuditLabel(action: string): string {
    const labels: Record<string, string> = {
      'appointment.createDraft': 'Membuat draft',
      'appointment.submit': 'Mengajukan appointment',
      'appointment.approve': 'Menyetujui appointment',
      'appointment.reject': 'Menolak appointment',
      'appointment.cancel': 'Membatalkan appointment',
      'appointment.suspend': 'Menangguhkan appointment',
      'appointment.resume': 'Melanjutkan appointment',
      'appointment.end': 'Mengakhiri appointment',
      'appointment.supersede': 'Mengaktifkan pengganti',
    };
    return labels[action] ?? 'Aksi appointment';
  }

  private async validateContext(dto: CreateAppointmentDto, schoolDate: Date) {
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
        select: { id: true, code: true, scopeType: true, maxActiveHolders: true },
      }),
      this.prisma.academicYear.findUnique({
        where: { id: dto.academicYearId },
        select: { id: true, startDate: true, endDate: true, isActive: true },
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
    if (!academicYear.isActive && academicYear.endDate < schoolDate) {
      throw new BadRequestException('Appointment manual hanya dapat dibuat untuk tahun ajaran aktif atau mendatang.');
    }
    if (dto.effectiveUntil && dto.effectiveUntil < dto.effectiveFrom) {
      throw new BadRequestException('Tanggal akhir appointment tidak boleh lebih awal dari tanggal mulai.');
    }
    if (dto.effectiveUntil && dto.effectiveUntil > academicYear.endDate) {
      throw new BadRequestException('Tanggal akhir appointment tidak boleh melewati tahun ajaran.');
    }
    if (dto.kind === 'PLT') {
      if (!dto.replacesAppointmentId) {
        throw new BadRequestException('PLT memerlukan appointment definitif yang ditangguhkan.');
      }
      if (!dto.effectiveUntil || !dto.reason) {
        throw new BadRequestException('PLT memerlukan alasan dan tanggal akhir.');
      }
    }

    return { staff, position, academicYear };
  }

  private async assertReplacementPlan(
    dto: CreateAppointmentDto,
    maxActiveHolders: number,
  ): Promise<void> {
    const scopeWhere = this.scopeWhere(dto.positionId, dto.academicYearId, dto.majorId ?? null);
    const [activeCount, currentHolder] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          ...scopeWhere,
          status: ACTIVE_CAPACITY_STATUS,
        },
      }),
      this.prisma.appointment.findFirst({
        where: {
          ...scopeWhere,
          status: { in: [ACTIVE_CAPACITY_STATUS, SUSPENDED_STATUS] },
        },
        orderBy: { id: 'asc' },
        select: { id: true, status: true },
      }),
    ]);

    if (
      currentHolder &&
      !dto.replacesAppointmentId &&
      (activeCount >= maxActiveHolders || currentHolder.status === SUSPENDED_STATUS || dto.kind === 'PLT')
    ) {
      throw new ConflictException('Scope jabatan sudah memiliki pemangku. Tentukan replacesAppointmentId untuk successor atau PLT.');
    }

    if (dto.replacesAppointmentId) {
      const replaced = await this.prisma.appointment.findUnique({
        where: { id: dto.replacesAppointmentId },
        select: {
          id: true,
          status: true,
          kind: true,
          staffId: true,
          academicYearId: true,
          positionId: true,
          majorId: true,
        },
      });
      if (!replaced) throw new BadRequestException('Appointment pengganti tidak ditemukan.');
      if (dto.kind === 'PLT') {
        if (replaced.kind !== 'DEFINITIVE' || replaced.status !== SUSPENDED_STATUS) {
          throw new ConflictException('PLT hanya dapat disiapkan untuk appointment definitif yang sedang SUSPENDED.');
        }
      } else if (!['ACTIVE', 'SUSPENDED'].includes(replaced.status)) {
        throw new ConflictException('Appointment yang digantikan harus ACTIVE atau SUSPENDED.');
      }
      if (!this.sameScope(dto, replaced)) {
        throw new BadRequestException('Appointment pengganti harus berada pada jabatan dan scope yang sama (tahun ajaran boleh berbeda untuk reappointment lintas tahun).');
      }
      if (currentHolder && currentHolder.id !== replaced.id) {
        throw new ConflictException('replacesAppointmentId tidak cocok dengan pemangku aktif/suspended saat ini.');
      }

      // Wave C (Director Decision 5): Reappointment same-person lintas tahun DIDUKUNG,
      // same-person same-year DITOLAK (masa jabatan belum berakhir).
      if (
        replaced.staffId === dto.staffId &&
        replaced.academicYearId === dto.academicYearId
      ) {
        throw new BadRequestException(
          'Masa jabatan belum berakhir — tidak perlu reappointment di tahun yang sama. ' +
          'Perpanjangan masa jabatan orang yang sama hanya berlaku lintas tahun ajaran.',
        );
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
        replacesAppointmentId: null,
      },
      select: { id: true },
    });
    if (preparedCandidate && activeCount + 1 >= maxActiveHolders) {
      throw new ConflictException('Scope jabatan sudah memiliki kandidat appointment yang masih terbuka.');
    }
  }

  private async assertCanResumeWithinCapacity(
    appointment: AppointmentTransitionTarget,
    client: AppointmentLookupClient = this.prisma,
  ): Promise<void> {
    const scopeWhere = this.scopeWhere(
      appointment.position.id,
      appointment.academicYearId,
      appointment.majorId,
    );
    const linkedOpenPlt = await client.appointment.findFirst({
      where: {
        ...scopeWhere,
        replacesAppointmentId: appointment.id,
        status: { in: [...OPEN_PLT_BLOCKING_STATUSES] },
        kind: 'PLT',
      },
      select: { id: true },
    });
    if (linkedOpenPlt) {
      throw new ConflictException('Masih ada PLT terbuka untuk appointment ini. Batalkan atau akhiri PLT sebelum pemangku definitif kembali.');
    }

    const otherActiveCount = await client.appointment.count({
      where: {
        ...scopeWhere,
        status: ACTIVE_CAPACITY_STATUS,
        id: { not: appointment.id },
      },
    });
    if (otherActiveCount + 1 > appointment.position.maxActiveHolders) {
      throw new ConflictException('Kapasitas jabatan penuh. Akhiri pemangku aktif lain sebelum appointment dilanjutkan kembali.');
    }
  }

  private async assertPltReplacementCanOperate(
    client: AppointmentLookupClient,
    appointment: Pick<AppointmentTransitionTarget, 'kind' | 'replacesAppointmentId'>,
  ): Promise<void> {
    if (appointment.kind !== 'PLT') return;
    if (!appointment.replacesAppointmentId) {
      throw new ConflictException('PLT memerlukan appointment definitif yang sedang ditangguhkan.');
    }
    const replaced = await client.appointment.findUnique({
      where: { id: appointment.replacesAppointmentId },
      select: { id: true, kind: true, status: true },
    });
    if (!replaced || replaced.kind !== 'DEFINITIVE' || replaced.status !== SUSPENDED_STATUS) {
      throw new ConflictException('PLT hanya dapat berjalan saat appointment definitif sedang SUSPENDED.');
    }
  }

  private async assertSubmitDoesNotDuplicateOpenCandidate(
    appointment: AppointmentTransitionTarget,
    client: AppointmentLookupClient = this.prisma,
  ): Promise<void> {
    if (appointment.replacesAppointmentId) return;

    const scopeWhere = this.scopeWhere(
      appointment.position.id,
      appointment.academicYearId,
      appointment.majorId,
    );
    const [activeCount, preparedCount] = await Promise.all([
      client.appointment.count({
        where: { ...scopeWhere, status: ACTIVE_CAPACITY_STATUS },
      }),
      client.appointment.count({
        where: {
          ...scopeWhere,
          status: { in: [...PREPARED_STATUSES] },
          replacesAppointmentId: null,
          id: { not: appointment.id },
        },
      }),
    ]);
    if (activeCount + preparedCount >= appointment.position.maxActiveHolders) {
      throw new ConflictException('Scope jabatan sudah memiliki kandidat appointment yang masih terbuka.');
    }
  }

  private assertReplacementScope(
    successor: AppointmentTransitionTarget,
    replaced: AppointmentTransitionTarget,
  ): void {
    const same =
      successor.position.id === replaced.position.id &&
      (successor.majorId ?? null) === (replaced.majorId ?? null);
    if (!same) {
      throw new BadRequestException('Successor dan appointment yang digantikan harus berada pada scope yang sama.');
    }
    if (successor.kind === 'PLT' && successor.academicYearId !== replaced.academicYearId) {
      throw new BadRequestException('PLT harus berada pada tahun ajaran yang sama dengan appointment definitif.');
    }
  }

  /**
   * Scope match untuk replacement plan. Wave C (Director Decision 5):
   * positionId + majorId harus cocok. academicYearId BOLEH berbeda untuk
   * reappointment lintas tahun (mis. 2026/2027 → 2027/2028).
   */
  private sameScope(
    dto: CreateAppointmentDto,
    appointment: { positionId: string; academicYearId: string; majorId: string | null },
  ): boolean {
    return (
      dto.positionId === appointment.positionId &&
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

  private async getTransitionTarget(
    id: string,
    client: AppointmentLookupClient = this.prisma,
  ): Promise<AppointmentTransitionTarget> {
    const appointment = await client.appointment.findUnique({
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
        position: { select: { id: true, code: true, scopeType: true, maxActiveHolders: true } },
        staff: { select: { id: true, userId: true, user: { select: { keycloakId: true } } } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment tidak ditemukan.');
    return appointment;
  }

  private async withLifecycleLock<T>(
    callback: (tx: AppointmentTx, now: Date, schoolDate: Date) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireActivationLock(tx);
      const now = new Date();
      return callback(tx, now, getSchoolDate(now));
    }).catch((error) => {
      this.rethrowConstraint(error);
      throw error;
    });
  }

  private async casAppointmentStatus(
    tx: AppointmentTx,
    id: string,
    expectedStatuses: string[],
    data: Prisma.AppointmentUpdateManyMutationInput,
  ): Promise<void> {
    const updated = await tx.appointment.updateMany({
      where: { id, status: { in: expectedStatuses as Prisma.EnumAppointmentStatusFilter['in'] } },
      data,
    });
    if (updated.count !== 1) {
      throw new ConflictException('Status Appointment telah berubah. Muat ulang data sebelum mencoba kembali.');
    }
  }

  private assertStatus(status: string, expectedStatuses: string[], message: string): void {
    if (!expectedStatuses.includes(status)) throw new ConflictException(message);
  }

  private assertNotExpired(
    appointment: Pick<AppointmentTransitionTarget, 'effectiveUntil'>,
    schoolDate: Date,
    message: string,
  ): void {
    if (appointment.effectiveUntil && appointment.effectiveUntil < schoolDate) {
      throw new ConflictException(message);
    }
  }

  private invalidateUsers(keycloakIds: Iterable<string>): void {
    for (const keycloakId of new Set(keycloakIds)) {
      this.permissions.invalidateUser(keycloakId);
    }
  }

  private async assertCanPrepare(
    actor: AuthUser,
    targetPositionCode: string,
    schoolDate: Date = getSchoolDate(),
    client?: AppointmentAuthorityClient,
  ): Promise<void> {
    const actorContext = await this.getActorContext(actor, schoolDate, client);
    if (this.canPreparePosition(actorContext, targetPositionCode)) return;
    if (targetPositionCode === 'KEPALA_SEKOLAH') {
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat menyiapkan appointment Kepala Sekolah.');
    }

    throw new ForbiddenException('Appointment hanya dapat disiapkan oleh SUPER_ADMIN atau Kepala Sekolah aktif.');
  }

  private async assertCanApprove(
    actor: AuthUser,
    targetPositionCode: string,
    schoolDate: Date = getSchoolDate(),
    client?: AppointmentAuthorityClient,
  ): Promise<void> {
    const actorContext = await this.getActorContext(actor, schoolDate, client);
    if (this.canApprovePosition(actorContext, targetPositionCode)) return;
    if (targetPositionCode === 'KEPALA_SEKOLAH') {
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat menyetujui appointment Kepala Sekolah.');
    }

    throw new ForbiddenException('Appointment hanya dapat disetujui oleh SUPER_ADMIN atau Kepala Sekolah aktif.');
  }

  private async actorHasActiveKepalaSekolah(actor: AuthUser, schoolDate: Date): Promise<boolean> {
    const positions = await this.permissions.getActivePositionCodes(actor.keycloakId, schoolDate);
    return positions.has('KEPALA_SEKOLAH');
  }

  private async actorHasActiveKepalaSekolahInTransaction(
    client: AppointmentAuthorityClient,
    actor: AuthUser,
    schoolDate: Date,
  ): Promise<boolean> {
    const user = await client.user.findUnique({
      where: { keycloakId: actor.keycloakId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) return false;
    const activeYear = await client.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!activeYear) return false;
    const appointmentCount = await client.appointment.count({
      where: {
        status: ACTIVE_CAPACITY_STATUS,
        staff: { userId: user.id, deletedAt: null },
        academicYearId: activeYear.id,
        position: { code: 'KEPALA_SEKOLAH', isActive: true, scopeType: 'NONE' },
        majorId: null,
        effectiveFrom: { lte: schoolDate },
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gte: schoolDate } },
        ],
      },
    });
    return appointmentCount > 0;
  }

  private async requireActor(actor: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId: actor.keycloakId },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Actor tidak ditemukan di database.');
    return user;
  }
  private rethrowConstraint(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.message.includes('appointment active capacity exceeded'))
    ) {
      throw new ConflictException('Appointment live untuk jabatan/scope ini sudah ada.');
    }
  }
}
