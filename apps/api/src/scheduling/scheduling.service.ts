import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { getSchoolDate } from '../common/helpers/school-date.helper';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArchiveDraftSchema, CreateDraftSchema, DraftSlot, IdempotencyKeySchema, ListDraftSchema,
  PrecheckDraftSchema, RenameDraftSchema, ReplaceDraftSchema, parseDraft,
} from './dto/scheduling-draft.dto';
import { SchedulingAudit } from './scheduling-audit';
import { schedulingPolicy } from './scheduling-feature-policy';
import { DraftScope, captureSchedulingInput, digest, jsonValue } from './scheduling-input-snapshot';
import { validateDraft } from './scheduling-validator';

const DOMAIN_LOCK = 'academic:schedule:mutation:v1';
type Root = Prisma.SchedulingVersionGetPayload<{ include: { slots: true } }>;
type Operation = 'CREATE' | 'RENAME' | 'REPLACE_SLOTS' | 'ARCHIVE';
const AcknowledgmentSchema = z.object({
  id: z.string().uuid(), revision: z.number().int(), status: z.enum(['DRAFT', 'ARCHIVED']),
  inputDigest: z.string(), acknowledgmentOnly: z.literal(true),
  validation: z.literal('NOT_CERTIFIED'), published: z.literal(false),
});
const ScopeSchema = z.object({ classIds: z.array(z.string().uuid()).min(1).max(1024) }).strict();

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly period: AcademicPeriodService,
    private readonly audit: SchedulingAudit,
  ) {}

  private async locks(tx: Prisma.TransactionClient, actor: string, permission: string, id?: string, write = false) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${DOMAIN_LOCK}))`);
    await this.period.acquireCutoverLock(tx);
    if (id && write) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM academic.scheduling_versions WHERE id=${id}::uuid FOR UPDATE`);
    }
    await assertFreshMutationAuthority(tx, this.permissions, actor, permission, ['SUPER_ADMIN']);
    schedulingPolicy(); // Recheck a flag disabled while this request was waiting.
  }
  private scope(root: Root): DraftScope {
    return { academicYearId: root.academicYearId, semesterNumber: root.semesterNumber,
      effectiveFrom: root.effectiveFrom.toISOString().slice(0, 10),
      effectiveUntil: root.effectiveUntil.toISOString().slice(0, 10),
      classIds: ScopeSchema.parse(root.scopeJson).classIds };
  }
  private async root(tx: Prisma.TransactionClient, id: string) {
    const root = await tx.schedulingVersion.findUnique({
      where: { id }, include: { slots: { orderBy: [{ assignmentId: 'asc' }, { sessionIndex: 'asc' }] } },
    });
    if (!root) throw new NotFoundException('Draft jadwal tidak ditemukan');
    return root;
  }
  private size(classIds: string[], slots?: DraftSlot[]) {
    const policy = schedulingPolicy();
    if (classIds.length > policy.maxClasses || (slots && slots.length > policy.maxSlots)) {
      throw new BadRequestException('Scope/batch melebihi batas teknis draft');
    }
  }
  private dates(scope: DraftScope) {
    const days = (Date.parse(scope.effectiveUntil) - Date.parse(scope.effectiveFrom)) / 86400000 + 1;
    if (!Number.isInteger(days) || days < 1 || days > schedulingPolicy().maxOccurrenceDays) {
      throw new BadRequestException('Rentang occurrence melebihi batas teknis draft');
    }
  }
  private async read<T>(actor: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    schedulingPolicy();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await this.locks(tx, actor, 'academic.schedule.draft.read');
      return fn(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 20000 });
  }

  /** Paginated internal draft metadata. Never exposes snapshot contents to other roles. */
  async list(raw: unknown, actor: string) {
    schedulingPolicy();
    const query = parseDraft(ListDraftSchema, raw);
    return this.read(actor, async (tx) => {
      const where = { academicYearId: query.academicYearId, semesterNumber: query.semesterNumber, status: query.status };
      const items = await tx.schedulingVersion.findMany({ where, skip: query.offset, take: query.limit,
        orderBy: { versionNumber: 'desc' },
        select: { id: true, name: true, status: true, versionNumber: true, revision: true,
          effectiveFrom: true, effectiveUntil: true, updatedAt: true } });
      return { items, total: await tx.schedulingVersion.count({ where }), readiness: 'NOT_CHECKED', published: false };
    });
  }
  /** Current draft and a fresh, non-persisted precheck; source drift is always explicit. */
  async get(id: string, actor: string) {
    return this.read(actor, async (tx) => {
      const root = await this.root(tx, parseDraft(z.string().uuid(), id));
      const scope = this.scope(root);
      this.dates(scope);
      this.size(scope.classIds, root.slots);
      const input = await captureSchedulingInput(tx, scope);
      const currentInputDigest = digest(input);
      return { id: root.id, name: root.name, status: root.status, versionNumber: root.versionNumber,
        revision: root.revision, scope, slots: root.slots, inputDigest: root.inputDigest,
        currentInputDigest, stale: root.inputDigest !== currentInputDigest,
        precheck: validateDraft(scope, input, root.slots, getSchoolDate().toISOString().slice(0, 10)) };
    });
  }
  /** Zero-write validation including invalid/error paths; no stamp or preview token. */
  async precheck(id: string, raw: unknown, actor: string) {
    schedulingPolicy();
    const dto = parseDraft(PrecheckDraftSchema, raw);
    return this.read(actor, async (tx) => {
      const root = await this.root(tx, parseDraft(z.string().uuid(), id));
      const scope = this.scope(root);
      this.dates(scope);
      const slots = dto.slots ?? root.slots;
      this.size(scope.classIds, slots);
      const input = await captureSchedulingInput(tx, scope);
      const inputDigest = digest(input);
      return { ...validateDraft(scope, input, slots, getSchoolDate().toISOString().slice(0, 10)),
        revision: root.revision, inputDigest, stale: inputDigest !== root.inputDigest };
    });
  }

  /** Create a manual empty proposal; no import or operational schedule mutation. */
  async create(raw: unknown, actor: string, key: string) {
    schedulingPolicy();
    const dto = parseDraft(CreateDraftSchema, raw);
    this.size(dto.classIds);
    this.dates(dto);
    return this.mutate('CREATE', null, dto, actor, key, async (tx) => {
      const scope: DraftScope = dto;
      const input = await captureSchedulingInput(tx, scope);
      const check = validateDraft(scope, input, [], getSchoolDate().toISOString().slice(0, 10));
      if (check.errors.length) throw new ConflictException(check);
      await this.period.assertWritableSemesterId(tx, input.period!.id);
      const max = await tx.schedulingVersion.aggregate({
        where: { academicYearId: dto.academicYearId, semesterNumber: dto.semesterNumber }, _max: { versionNumber: true },
      });
      return tx.schedulingVersion.create({ data: {
        academicYearId: dto.academicYearId, semesterNumber: dto.semesterNumber,
        versionNumber: (max._max.versionNumber ?? 0) + 1, name: dto.name,
        effectiveFrom: new Date(dto.effectiveFrom), effectiveUntil: new Date(dto.effectiveUntil),
        scopeJson: { classIds: dto.classIds }, inputSnapshotJson: jsonValue(input),
        inputDigest: digest(input), createdBy: actor,
      }, include: { slots: true } });
    });
  }
  /** Rename without silently certifying or refreshing the stored source snapshot. */
  async rename(id: string, raw: unknown, actor: string, key: string) {
    schedulingPolicy();
    const dto = parseDraft(RenameDraftSchema, raw);
    return this.mutate('RENAME', id, dto, actor, key, async (tx, root) => {
      return tx.schedulingVersion.update({ where: { id: root!.id },
        data: { name: dto.name, revision: { increment: 1 } }, include: { slots: true } });
    }, dto.expectedRevision);
  }
  /** Replace every proposed slot atomically; incomplete coverage remains a draft warning. */
  async replace(id: string, raw: unknown, actor: string, key: string) {
    schedulingPolicy();
    const dto = parseDraft(ReplaceDraftSchema, raw);
    return this.mutate('REPLACE_SLOTS', id, dto, actor, key, async (tx, root) => {
      const scope = this.scope(root!);
      this.dates(scope);
      this.size(scope.classIds, dto.slots);
      const input = await captureSchedulingInput(tx, scope);
      const check = validateDraft(scope, input, dto.slots, getSchoolDate().toISOString().slice(0, 10));
      if (check.errors.length) throw new ConflictException(check);
      await tx.schedulingVersionSlot.deleteMany({ where: { versionId: root!.id } });
      if (dto.slots.length) await tx.schedulingVersionSlot.createMany({ data: dto.slots.map((slot) =>
        ({ ...slot, versionId: root!.id })) });
      return tx.schedulingVersion.update({ where: { id: root!.id },
        data: { revision: { increment: 1 }, inputSnapshotJson: jsonValue(input), inputDigest: digest(input) },
        include: { slots: true } });
    }, dto.expectedRevision);
  }
  /** Soft archive, never delete/publish/restore. */
  async archive(id: string, raw: unknown, actor: string, key: string) {
    schedulingPolicy();
    const dto = parseDraft(ArchiveDraftSchema, raw);
    return this.mutate('ARCHIVE', id, dto, actor, key, async (tx, root) =>
      tx.schedulingVersion.update({ where: { id: root!.id },
        data: { status: 'ARCHIVED', archivedAt: new Date(), revision: { increment: 1 } }, include: { slots: true } }),
    dto.expectedRevision);
  }

  private async mutate(operation: Operation, id: string | null, request: unknown, actor: string, key: string,
    change: (tx: Prisma.TransactionClient, root: Root | null) => Promise<Root>, expectedRevision?: number) {
    if (id) parseDraft(z.string().uuid(), id);
    const keyHash = digest(parseDraft(IdempotencyKeySchema, key));
    const requestHash = digest({ id, request });
    return this.prisma.$transaction(async (tx) => {
      await this.locks(tx, actor, 'academic.schedule.edit', id ?? undefined, true);
      const root = id ? await this.root(tx, id) : null;
      const receipt = await tx.schedulingMutationReceipt.findUnique({
        where: { actorId_operation_keyHash: { actorId: actor, operation, keyHash } },
      });
      if (receipt) {
        if (receipt.requestHash !== requestHash) throw new ConflictException('Idempotency key sudah dipakai untuk permintaan berbeda');
        return { ...AcknowledgmentSchema.parse(receipt.responseJson), replayed: true };
      }
      if (root) {
        if (root.status !== 'DRAFT') throw new ConflictException('Draft yang diarsipkan tidak dapat diubah');
        if (root.revision !== expectedRevision) throw new ConflictException('Revision draft berubah; muat ulang sebelum menyimpan');
        const period = await tx.semester.findUnique({
          where: { academicYearId_number: { academicYearId: root.academicYearId, number: root.semesterNumber } },
          select: { id: true },
        });
        if (!period) throw new ConflictException('Periode draft tidak ditemukan');
        await this.period.assertWritableSemesterId(tx, period.id);
      }
      const updated = await change(tx, root);
      const ack = AcknowledgmentSchema.parse({ id: updated.id, revision: updated.revision, status: updated.status,
        inputDigest: updated.inputDigest, acknowledgmentOnly: true, validation: 'NOT_CERTIFIED', published: false });
      await this.audit.record(tx, actor, operation, updated.id, updated.revision, updated.inputDigest, requestHash);
      await tx.schedulingMutationReceipt.create({ data: { versionId: updated.id, actorId: actor, operation,
        keyHash, requestHash, responseJson: jsonValue(ack) } });
      return { ...ack, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 20000 });
  }
}
