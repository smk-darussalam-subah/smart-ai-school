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
import { schedulingImportPolicy, schedulingPolicy } from './scheduling-feature-policy';
import { ImportCommitSchema, ImportFileSchema, ImportPreview, ImportPreviewSchema } from './dto/scheduling-import.dto';
import { parseImportFile } from './scheduling-import-parser';
import { mapImportRows } from './scheduling-import-mapping';
import { DraftScope, captureSchedulingInput, digest, jsonValue } from './scheduling-input-snapshot';
import { validateDraft } from './scheduling-validator';

const DOMAIN_LOCK = 'academic:schedule:mutation:v1';
type Root = Prisma.SchedulingVersionGetPayload<{ include: { slots: true } }>;
type Operation = 'CREATE' | 'RENAME' | 'REPLACE_SLOTS' | 'ARCHIVE' | 'IMPORT';
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
        sourceType: root.sourceType, importProvenance: root.importProvenance,
        revision: root.revision, scope, slots: root.slots, inputDigest: root.inputDigest,
        currentInputDigest, stale: root.inputDigest !== currentInputDigest,
        precheck: validateDraft(scope, input, root.slots, getSchoolDate().toISOString().slice(0, 10)) };
    });
  }

  /** Read-only file inspection; no upload storage, audit body or student data. */
  async inspectImport(raw: unknown, actor: string) {
    schedulingImportPolicy();
    const file = parseDraft(ImportFileSchema, raw);
    return this.read(actor, async () => {
      schedulingImportPolicy();
      const parsed = await parseImportFile(file);
      return { headers: parsed.headers, sheets: parsed.sheets, rowCount: parsed.rows.length,
        fileSha256: parsed.fileSha256, sample: parsed.rows.slice(0, 5) };
    });
  }

  async importCatalog(raw: unknown, actor: string) {
    schedulingImportPolicy();
    const draft = parseDraft(CreateDraftSchema, raw);
    this.size(draft.classIds); this.dates(draft);
    return this.read(actor, async (tx) => {
      schedulingImportPolicy();
      const input = await captureSchedulingInput(tx, draft);
      const check = validateDraft(draft, input, [], getSchoolDate().toISOString().slice(0, 10));
      if (check.errors.length) throw new ConflictException(check);
      const assignments = await tx.teachingAssignment.findMany({
        where: { id: { in: input.assignments.filter((a) => draft.classIds.includes(a.classId)).map((a) => a.id) } },
        select: { id: true, subject: true, hoursPerWeek: true,
          class: { select: { name: true } }, teacher: { select: { user: { select: { fullName: true } } } } },
        orderBy: { id: 'asc' },
      });
      return { assignments: assignments.map((a) => ({ id: a.id, subject: a.subject, targetJp: a.hoursPerWeek,
        className: a.class.name, teacherName: a.teacher.user.fullName })), published: false };
    });
  }

  private async importCheck(tx: Prisma.TransactionClient, dto: ImportPreview) {
    schedulingImportPolicy();
    const parsed = await parseImportFile(dto.file);
    const input = await captureSchedulingInput(tx, dto.draft);
    const mapped = mapImportRows(parsed, dto.mapping, input, dto.draft.classIds);
    this.size(dto.draft.classIds, mapped.slots);
    const today = getSchoolDate().toISOString().slice(0, 10);
    const precheck = validateDraft(dto.draft, input, mapped.slots, today);
    const errors = [...mapped.errors, ...precheck.errors.map((issue) => ({ ...issue,
      row: issue.slot === undefined ? 0 : mapped.rowNumbers[issue.slot] ?? 0 }))];
    const inputDigest = digest(input);
    // This is a stale-data binding, NEVER a bearer/approval token. All checks rerun on commit.
    const previewDigest = digest({ dto, fileSha256: parsed.fileSha256, inputDigest, today });
    return { input, slots: mapped.slots, preview: { previewDigest, inputDigest, rowCount: parsed.rows.length,
      parsedSlotCount: mapped.slots.length, sources: mapped.sources, errors, warnings: precheck.warnings,
      coverage: precheck.coverage, slots: mapped.slots, notVerified: precheck.notVerified,
      solverStatus: null, publishable: false, commitAllowed: errors.length === 0 },
    provenance: { fileSha256: parsed.fileSha256, format: dto.file.format, parserVersion: 1,
      rowCount: parsed.rows.length, mappingDigest: digest({ mapping: dto.mapping,
        sheet: dto.file.sheet, headerRow: dto.file.headerRow, delimiter: dto.file.delimiter }) } };
  }

  async previewImport(raw: unknown, actor: string) {
    schedulingImportPolicy();
    const dto = parseDraft(ImportPreviewSchema, raw);
    this.size(dto.draft.classIds); this.dates(dto.draft);
    return this.read(actor, async (tx) => (await this.importCheck(tx, dto)).preview);
  }

  /** Single atomic root+all-slots+provenance+audit+receipt. Never writes the active schedule. */
  async commitImport(raw: unknown, actor: string, key: string) {
    schedulingImportPolicy();
    const dto = parseDraft(ImportCommitSchema, raw);
    this.size(dto.draft.classIds); this.dates(dto.draft);
    return this.mutate('IMPORT', null, dto, actor, key, async (tx) => {
      const { expectedPreviewDigest, ...request } = dto;
      const checked = await this.importCheck(tx, request);
      if (checked.preview.previewDigest !== expectedPreviewDigest) {
        throw new ConflictException('Pratinjau sudah berubah. Validasi ulang sebelum menyimpan.');
      }
      if (!checked.preview.commitAllowed) throw new ConflictException(checked.preview);
      await this.period.assertWritableSemesterId(tx, checked.input.period!.id);
      const max = await tx.schedulingVersion.aggregate({
        where: { academicYearId: dto.draft.academicYearId, semesterNumber: dto.draft.semesterNumber }, _max: { versionNumber: true },
      });
      return tx.schedulingVersion.create({ data: {
        academicYearId: dto.draft.academicYearId, semesterNumber: dto.draft.semesterNumber,
        versionNumber: (max._max.versionNumber ?? 0) + 1, name: dto.draft.name,
        effectiveFrom: new Date(dto.draft.effectiveFrom), effectiveUntil: new Date(dto.draft.effectiveUntil),
        scopeJson: { classIds: dto.draft.classIds }, sourceType: 'IMPORT',
        importProvenance: jsonValue(checked.provenance), inputSnapshotJson: jsonValue(checked.input),
        inputDigest: checked.preview.inputDigest, createdBy: actor,
        slots: { create: checked.slots },
      }, include: { slots: true } });
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
      if (operation === 'IMPORT') schedulingImportPolicy();
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
