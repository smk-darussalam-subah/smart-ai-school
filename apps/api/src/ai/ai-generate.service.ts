import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { AIGateway, AiChatOptions } from '@smk/types';
import { z } from 'zod';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTeacherId } from '../common/helpers/role-helpers';
import {
  AcceptQuestionDraftDto,
  GenerateQuestionDraftDto,
  AiRppSection,
  GenerateRppStepDto,
  RejectQuestionDraftDto,
  RegenerateQuestionDraftItemDto,
} from './dto/generate.dto';
import { hasPii, stripPiiForLlm } from './adapters/pii-strip.utils';
import { NotificationService } from '../notification/notification.service';
import { OpenAiProviderError } from './adapters/openai.adapter';
import { AiProviderStatusService } from './ai-provider-status.service';
import { QuestionPayloadSchema } from '../assessment/assessment-contract';
import { questionPayloadToData } from '../assessment/assessment-runtime';

type AiErrorCode =
  | 'AI_ENDPOINT_DISABLED'
  | 'AI_FOUNDATION_INCOMPLETE'
  | 'AI_CONTEXT_PII_BLOCKED'
  | 'AI_PROVIDER_RATE_LIMITED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_AUTH_FAILED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_OUTPUT_INVALID';

type RppForAi = {
  id: string;
  teacherId: string;
  classId: string | null;
  subject: string;
  title: string;
  body: Prisma.JsonValue | null;
  academicYear: string;
  semester: number;
  class: { id: string; name: string; grade: number; majorCode: string } | null;
};

type ResolvedRppContext = {
  teacherId: string;
  rpp: RppForAi;
  body: Record<string, unknown>;
};

type ResolvedQuestionSourceContext = {
  teacherId: string;
  sourceType: 'rpp' | 'module';
  sourceId: string;
  subject: string;
  title: string;
  academicYear: string;
  semester: number;
  classId: string;
  className: string;
  grade: number | null;
  majorName: string | null;
  majorDescription: string | null;
  tpOptions: Array<{ ref: string; text: string }>;
  contentSummary: string;
};

type AiCallResult = {
  output: string;
  model: 'ollama' | 'gpt-4.1-mini';
  promptForAudit: string;
};

type QuestionDraftLease = {
  leaseId: string;
  leaseExpiresAt: string;
  leaseSequence: number;
};

type QuestionDraftClaim =
  | { kind: 'claimed'; id: string; lease: QuestionDraftLease }
  | { kind: 'wait' }
  | { kind: 'ready'; response: { generationId: string; model: string; source: ReturnType<AiGenerateService['contextSnapshot']>; items: QuestionDraftItem[] } };

const QUESTION_DRAFT_LEASE_MS = 120_000;

const OPENAI_RATE_LIMIT_MAX_ATTEMPTS = 2;
const OPENAI_RATE_LIMIT_MAX_DELAY_MS = 2_000;

const OPENAI_QUOTA_ERROR_CODES = new Set([
  'credit_balance_exhausted',
  'insufficient_quota',
  'organization_usage_limit_exceeded',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
]);

const OPENAI_RATE_LIMIT_ERROR_CODES = new Set([
  'rate_limit_exceeded',
  'tokens_rate_limit_exceeded',
  'requests_rate_limit_exceeded',
]);

const MAJOR_PRODUCTIVE_CONTEXT_MAX_CHARS = 800;
const MAJOR_PRODUCTIVE_HINT_MAX_CHARS = 180;

const SECTION_LABELS: Record<AiRppSection, string> = {
  cp_tp: 'Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP)',
  atp: 'Alur Tujuan Pembelajaran (ATP)',
  profil: 'Dimensi Profil Lulusan',
  sarana: 'Sarana prasarana dan target peserta didik',
  kegiatan: 'Kegiatan pembelajaran',
  asesmen: 'Rencana asesmen',
  remedial: 'Pengayaan dan remedial',
  refleksi: 'Refleksi guru dan peserta didik',
  lampiran: 'Catatan lampiran pembelajaran',
};

const GRADUATE_PROFILE_DIMENSIONS = [
  'Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa',
  'Kewargaan',
  'Penalaran kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
] as const;

const LEGACY_PANCASILA_DIMENSIONS = [
  'Beriman & Berakhlak Mulia',
  'Berkebinekaan Global',
  'Bergotong Royong',
  'Mandiri',
  'Bernalar Kritis',
  'Kreatif',
] as const;

const FORBIDDEN_OUTPUT_PATTERNS = [
  /```/,
  /(?:^|\n)\s*#{1,6}\s+\S+/,
  /\bkompetensi\s+dasar\b/i,
  /\bkompetensi\s+inti\b/i,
  /\bki\s+(?:dan|\/|-|&)\s*kd\b/i,
  /\bki\s*\/\s*kd\b/i,
  /\bki\s*-\s*kd\b/i,
  /\bkd\b/i,
] as const;
const AMBIGUOUS_OPTION_PATTERNS = [
  /\bsemua\s+jawaban\s+benar\b/i,
  /\bsemua\s+benar\b/i,
  /\btidak\s+ada\s+jawaban\s+yang\s+benar\b/i,
  /\b(?:a|b|c|d)\s+(?:dan|&)\s+(?:a|b|c|d)\s+benar\b/i,
] as const;
const NEAR_DUPLICATE_THRESHOLD = 0.82;

const TextField = z.string().trim().min(3).max(3000);
const ShortTextField = z.string().trim().min(1).max(160);
const TpRefField = z.string().trim().regex(/^TP\s+\d+$/i);
const QuestionDraftItemSchema = z.object({
  itemKey: z.string().trim().min(3).max(80),
  question: QuestionPayloadSchema,
  tpRefs: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  cognitiveLevel: z.enum(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']),
  rationale: z.string().trim().min(3).max(1000),
  warnings: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
}).strict();
const QuestionDraftOutputSchema = z.object({
  items: z.array(QuestionDraftItemSchema).min(1).max(20),
}).strict();
type QuestionDraftItem = z.infer<typeof QuestionDraftItemSchema>;

const AtpItemSchema = z.object({
  tpRef: TpRefField,
  indikator: TextField,
}).strict();

const KegiatanItemSchema = z.object({
  pertemuan: ShortTextField,
  pendahuluan: TextField,
  inti: TextField,
  penutup: TextField,
  diferensiasi: TextField,
}).strict();

const PatchSchemas = {
  cp_tp: z.object({
    tp: z.array(TextField).min(1).max(12),
  }).strict(),
  atp: z.object({
    atp: z.array(AtpItemSchema).min(1).max(24),
  }).strict(),
  sarana: z.object({
    sarana: TextField,
    target: TextField,
  }).strict(),
  kegiatan: z.object({
    kegiatan: z.array(KegiatanItemSchema).min(1).max(12),
  }).strict(),
  asesmen: z.object({
    asesmenDiagnostik: TextField,
    asesmenFormatif: TextField,
    asesmenSumatif: TextField,
  }).strict(),
  remedial: z.object({
    pengayaan: TextField,
    remedial: TextField,
  }).strict(),
  refleksi: z.object({
    refleksiGuru: TextField,
    refleksiSiswa: TextField,
  }).strict(),
  lampiran: z.object({
    lampiran: TextField,
  }).strict(),
} as const;

@Injectable()
export class AiGenerateService {
  private readonly inProcessLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
    @Inject('OPENAI_GATEWAY') private readonly openaiGateway: AIGateway | null,
    private readonly providerStatus: AiProviderStatusService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  rejectLegacyGeneration(): never {
    throw new GoneException({
      message: 'AI_ENDPOINT_DISABLED',
      error: 'AI_ENDPOINT_DISABLED',
    });
  }

  async generateRppStep(dto: GenerateRppStepDto, user: AuthUser) {
    const resolved = await this.loadOwnedRppContext(dto.rppId, user);
    this.assertSectionFoundation(dto.section, resolved.body);

    const prompt = this.buildRppSectionPrompt(dto.section, resolved.rpp, resolved.body);
    const ai = await this.callAi(prompt, dto.section, resolved.rpp.academicYear, resolved.rpp, resolved.body);
    const output = this.normalizeSectionOutput(dto.section, ai.output, resolved.rpp, resolved.body);

    await this.auditGeneration({
      teacherId: resolved.teacherId,
      type: `rpp-${dto.section}`,
      prompt: ai.promptForAudit,
      output: typeof output === 'string' ? output : JSON.stringify(output),
      model: ai.model,
    });

    return { type: dto.section, output };
  }

  async generateQuestionDrafts(dto: GenerateQuestionDraftDto, user: AuthUser) {
    const context = await this.loadQuestionSourceContext(dto, user);
    this.assertRequestedTpRefs(dto.tpRefs, context);

    if (dto.teacherInstruction && hasPii(dto.teacherInstruction)) {
      throw this.aiException('AI_CONTEXT_PII_BLOCKED', HttpStatus.BAD_REQUEST);
    }
    this.assertProductiveContextConfigured(dto, context);

    return this.withInProcessLock(`ai-question-generate:${context.teacherId}:${dto.idempotencyKey}`, async () => {
      const requestSpec = this.generationRequestSpec(dto);
      const claim = await this.claimQuestionDraftGeneration(context, dto, requestSpec);
      if (claim.kind === 'ready') return claim.response;
      if (claim.kind === 'wait') return this.waitForQuestionDraftGeneration(context, dto, requestSpec);

      const prompt = this.buildQuestionDraftPrompt(dto, context);
      try {
        const { ai, parsed } = await this.callQuestionDraftAiWithBoundedRepair(prompt, dto, context);
        await this.assertNoQuestionDraftDuplicates(parsed.items, context.teacherId, context.subject);
        const output = JSON.stringify({ items: parsed.items });
        const stored = await this.finalizeQuestionDraftGeneration(claim.id, claim.lease, ai.promptForAudit, output, ai.model);

        return {
          generationId: stored.id,
          model: stored.model,
          source: this.contextSnapshot(context),
          items: parsed.items,
        };
      } catch (error) {
        await this.markQuestionDraftGenerationFailed(claim.id, claim.lease, prompt, error);
        if (error instanceof HttpException) throw error;
        throw this.mapProviderError(error, hasPii(prompt));
      }
    });
  }

  async acceptQuestionDrafts(generationId: string, dto: AcceptQuestionDraftDto, user: AuthUser) {
    return this.withInProcessLock(
      `ai-question-lifecycle:${generationId}`,
      () => this.acceptQuestionDraftsLocked(generationId, dto, user),
    );
  }

  private async acceptQuestionDraftsLocked(generationId: string, dto: AcceptQuestionDraftDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const generation = await this.prisma.aiGeneration.findFirst({
      where: { id: generationId, teacherId, type: 'question-drafts' },
      select: { id: true, teacherId: true, output: true, sourceType: true, sourceId: true, contextSnapshot: true, status: true },
    });
    if (!generation) throw new ForbiddenException('Draft AI Bank Soal tidak ditemukan');
    if (generation.status === 'rejected') throw new ConflictException('Draft AI Bank Soal sudah ditolak');

    const original = QuestionDraftOutputSchema.parse(JSON.parse(generation.output));
    const originalKeys = new Set(original.items.map((item) => item.itemKey));
    const context = await this.reloadQuestionGenerationContext(generation, user);
    const payloadFingerprint = this.acceptanceFingerprint(dto.items);

    for (const item of dto.items) {
      if (!originalKeys.has(item.itemKey)) {
        throw new BadRequestException(`Item draft ${item.itemKey} tidak dikenal`);
      }
      this.assertQuestionDraftItem({ ...item, rationale: 'accepted', warnings: [] }, context);
    }

    const accepted = await this.prisma.$transaction(async (tx) => {
      const acceptance = await tx.aiDraftAcceptance.upsert({
        where: {
          aiGenerationId_idempotencyKey: {
            aiGenerationId: generation.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        create: {
          aiGenerationId: generation.id,
          idempotencyKey: dto.idempotencyKey,
          payloadFingerprint,
          itemKeys: dto.items.map((item) => item.itemKey),
        },
        update: {},
        select: { payloadFingerprint: true },
      });
      if (acceptance.payloadFingerprint !== payloadFingerprint) {
        throw new ConflictException('Idempotency key accept sudah dipakai untuk payload berbeda');
      }

      const locked = await tx.aiGeneration.findFirst({
        where: { id: generationId, teacherId, type: 'question-drafts' },
        select: { id: true, status: true },
      });
      if (!locked) throw new ForbiddenException('Draft AI Bank Soal tidak ditemukan');
      if (locked.status === 'rejected') throw new ConflictException('Draft AI Bank Soal sudah ditolak');

      const result: Array<{ id: string; subject: string; type: string; body: string; difficulty: string; aiItemKey: string | null }> = [];
      const existingForGeneration = await tx.question.findMany({
        where: { aiGenerationId: generation.id },
        select: {
          id: true, subject: true, type: true, body: true, options: true, answer: true,
          difficulty: true, tags: true, rubric: true, aiItemKey: true, tpRefs: true, cognitiveLevel: true,
        },
      });
      const acceptedKeys = new Set(existingForGeneration.map((item) => item.aiItemKey).filter((item): item is string => Boolean(item)));
      for (const item of dto.items) {
        const data = {
          subject: item.question.subject,
          type: item.question.type,
          body: item.question.body,
          difficulty: item.question.difficulty,
          tags: item.question.tags,
          ...questionPayloadToData(item.question),
        };
        const question = await tx.question.upsert({
          where: { aiGenerationId_aiItemKey: { aiGenerationId: generation.id, aiItemKey: item.itemKey } },
          create: {
            teacherId,
            ...data,
            source: 'AI_ASSISTED',
            aiGenerationId: generation.id,
            aiItemKey: item.itemKey,
            tpRefs: item.tpRefs,
            cognitiveLevel: item.cognitiveLevel,
          },
          update: {},
          select: {
            id: true, subject: true, type: true, body: true, options: true, answer: true,
            difficulty: true, tags: true, rubric: true, aiItemKey: true, tpRefs: true, cognitiveLevel: true,
          },
        });
        const expected = { ...data, aiItemKey: item.itemKey, tpRefs: item.tpRefs, cognitiveLevel: item.cognitiveLevel };
        const current = {
          subject: question.subject,
          type: question.type,
          body: question.body,
          options: question.options,
          answer: question.answer,
          difficulty: question.difficulty,
          tags: question.tags,
          rubric: question.rubric,
          aiItemKey: question.aiItemKey,
          tpRefs: question.tpRefs,
          cognitiveLevel: question.cognitiveLevel,
        };
        if (this.persistedQuestionFingerprint(current) !== this.persistedQuestionFingerprint(expected)) {
          throw new ConflictException('Item draft sudah diterima dengan payload berbeda');
        }
        acceptedKeys.add(item.itemKey);
        result.push({
          id: question.id,
          subject: question.subject,
          type: question.type,
          body: question.body,
          difficulty: question.difficulty,
          aiItemKey: question.aiItemKey,
        });
      }

      await tx.aiGeneration.update({
        where: { id: generation.id },
        data: { status: original.items.every((item) => acceptedKeys.has(item.itemKey)) ? 'accepted' : 'partially_accepted' },
      });
      await tx.aiDraftAcceptance.update({
        where: {
          aiGenerationId_idempotencyKey: {
            aiGenerationId: generation.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        data: { status: 'accepted' },
      });
      return result;
    });

    return { generationId: generation.id, acceptedCount: accepted.length, questions: accepted };
  }

  async regenerateQuestionDraftItem(
    generationId: string,
    itemKey: string,
    dto: RegenerateQuestionDraftItemDto,
    user: AuthUser,
  ) {
    return this.withInProcessLock(
      `ai-question-lifecycle:${generationId}`,
      () => this.regenerateQuestionDraftItemLocked(generationId, itemKey, dto, user),
    );
  }

  private async regenerateQuestionDraftItemLocked(
    generationId: string,
    itemKey: string,
    dto: RegenerateQuestionDraftItemDto,
    user: AuthUser,
  ) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    if (dto.teacherInstruction && hasPii(dto.teacherInstruction)) {
      throw this.aiException('AI_CONTEXT_PII_BLOCKED', HttpStatus.BAD_REQUEST);
    }

    const generation = await this.prisma.aiGeneration.findFirst({
      where: { id: generationId, teacherId, type: 'question-drafts' },
      select: {
        id: true,
        output: true,
        requestSpec: true,
        contextSnapshot: true,
        sourceType: true,
        sourceId: true,
        status: true,
      },
    });
    if (!generation) throw new ForbiddenException('Draft AI Bank Soal tidak ditemukan');
    if (generation.status === 'accepted' || generation.status === 'rejected') {
      throw new ConflictException('Draft AI Bank Soal sudah selesai dan tidak dapat diregenerasi');
    }

    const original = QuestionDraftOutputSchema.parse(JSON.parse(generation.output));
    const target = original.items.find((item) => item.itemKey === itemKey);
    if (!target) throw new NotFoundException('Item draft AI tidak ditemukan');
    const acceptedItem = await this.prisma.question.findUnique({
      where: { aiGenerationId_aiItemKey: { aiGenerationId: generation.id, aiItemKey: itemKey } },
      select: { id: true },
    });
    if (acceptedItem) throw new ConflictException('Item draft sudah diterima dan tidak dapat diregenerasi');

    const context = await this.reloadQuestionGenerationContext(generation, user);
    const requestSpec = this.questionDraftSpecFromGeneration(generation.requestSpec, context);
    const regenerateDto: GenerateQuestionDraftDto = {
      ...(context.sourceType === 'module' ? { moduleId: context.sourceId } : { rppId: context.sourceId }),
      purpose: requestSpec.purpose,
      questionCount: 1,
      typeDistribution: {
        multiple_choice: target.question.type === 'multiple_choice' ? 1 : 0,
        true_false: target.question.type === 'true_false' ? 1 : 0,
        matching: target.question.type === 'matching' ? 1 : 0,
        essay: target.question.type === 'essay' ? 1 : 0,
      },
      difficultyDistribution: {
        easy: target.question.difficulty === 'easy' ? 1 : 0,
        medium: target.question.difficulty === 'medium' ? 1 : 0,
        hard: target.question.difficulty === 'hard' ? 1 : 0,
      },
      cognitiveDistribution: {
        C1: target.cognitiveLevel === 'C1' ? 1 : 0,
        C2: target.cognitiveLevel === 'C2' ? 1 : 0,
        C3: target.cognitiveLevel === 'C3' ? 1 : 0,
        C4: target.cognitiveLevel === 'C4' ? 1 : 0,
        C5: target.cognitiveLevel === 'C5' ? 1 : 0,
        C6: target.cognitiveLevel === 'C6' ? 1 : 0,
      },
      tpRefs: target.tpRefs,
      contextMode: requestSpec.contextMode,
      character: requestSpec.character,
      teacherInstruction: dto.teacherInstruction ?? requestSpec.teacherInstruction,
      idempotencyKey: `regen-${generation.id}-${itemKey.slice(0, 40)}`,
    };

    const prompt = [
      this.buildQuestionDraftPrompt(regenerateDto, context),
      `Regenerate tepat satu item pengganti untuk itemKey ${itemKey}. Jangan mengubah tipe, kesulitan, level kognitif, atau TP.`,
    ].join('\n');
    const { parsed } = await this.callQuestionDraftAiWithBoundedRepair(prompt, regenerateDto, context);
    const replacement: QuestionDraftItem = { ...parsed.items[0]!, itemKey: target.itemKey };
    const next = { items: original.items.map((item) => item.itemKey === itemKey ? replacement : item) };
    await this.assertNoQuestionDraftDuplicates(next.items, teacherId, context.subject);

    await this.prisma.aiGeneration.update({
      where: { id: generation.id },
      data: { output: JSON.stringify(next), status: 'drafted' },
    });

    return { generationId: generation.id, item: replacement };
  }

  async rejectQuestionDrafts(generationId: string, dto: RejectQuestionDraftDto, user: AuthUser) {
    return this.withInProcessLock(
      `ai-question-lifecycle:${generationId}`,
      () => this.rejectQuestionDraftsLocked(generationId, dto, user),
    );
  }

  private async rejectQuestionDraftsLocked(generationId: string, dto: RejectQuestionDraftDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const generation = await this.prisma.aiGeneration.findFirst({
      where: { id: generationId, teacherId, type: 'question-drafts' },
      select: { id: true, status: true, sourceType: true, sourceId: true, contextSnapshot: true },
    });
    if (!generation) throw new ForbiddenException('Draft AI Bank Soal tidak ditemukan');
    if (generation.status === 'accepted') throw new ConflictException('Draft AI Bank Soal sudah diterima');
    await this.reloadQuestionGenerationContext(generation, user);

    const acceptedCount = await this.prisma.question.count({
      where: { aiGenerationId: generation.id },
    });
    if (acceptedCount > 0) {
      throw new ConflictException('Sebagian item sudah diterima; draft tidak dapat ditolak seluruhnya');
    }

    const fingerprint = this.questionFingerprint({ generationId, action: 'reject', idempotencyKey: dto.idempotencyKey });
    await this.prisma.$transaction(async (tx) => {
      const acceptance = await tx.aiDraftAcceptance.upsert({
        where: {
          aiGenerationId_idempotencyKey: {
            aiGenerationId: generation.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        create: {
          aiGenerationId: generation.id,
          idempotencyKey: dto.idempotencyKey,
          payloadFingerprint: fingerprint,
          itemKeys: [],
          status: 'accepted',
        },
        update: {},
        select: { payloadFingerprint: true },
      });
      if (acceptance.payloadFingerprint !== fingerprint) {
        throw new ConflictException('Idempotency key reject sudah dipakai untuk payload berbeda');
      }
      await tx.aiGeneration.updateMany({
        where: { id: generation.id, status: { not: 'accepted' } },
        data: { status: 'rejected' },
      });
    });

    return { generationId: generation.id, rejected: true };
  }

  private async claimQuestionDraftGeneration(
    context: ResolvedQuestionSourceContext,
    dto: GenerateQuestionDraftDto,
    requestSpec: Record<string, unknown>,
  ): Promise<QuestionDraftClaim> {
    const existing = await this.prisma.aiGeneration.findFirst({
      where: { teacherId: context.teacherId, type: 'question-drafts', idempotencyKey: dto.idempotencyKey },
      select: { id: true, requestSpec: true, output: true, model: true, status: true },
    });
    if (existing) {
      this.assertQuestionDraftRequestMatches(existing.requestSpec, requestSpec);
      if (existing.status === 'generating') {
        const existingLease = this.questionDraftLease(existing.requestSpec);
        if (!this.isQuestionDraftLeaseExpired(existingLease)) return { kind: 'wait' };
        const nextLease = this.newQuestionDraftLease((existingLease?.leaseSequence ?? 0) + 1);
        const reclaimed = await this.reclaimQuestionDraftGeneration(existing.id, existingLease, requestSpec, nextLease);
        return reclaimed ? { kind: 'claimed', id: existing.id, lease: nextLease } : { kind: 'wait' };
      }
      if (existing.status === 'failed') {
        const nextLease = this.newQuestionDraftLease((this.questionDraftLease(existing.requestSpec)?.leaseSequence ?? 0) + 1);
        const claimed = await this.prisma.aiGeneration.updateMany({
          where: { id: existing.id, status: 'failed' },
          data: {
            status: 'generating',
            prompt: '',
            output: '',
            model: 'pending',
            requestSpec: this.storedQuestionDraftRequestSpec(requestSpec, nextLease) as Prisma.InputJsonValue,
          },
        });
        return claimed.count === 1 ? { kind: 'claimed', id: existing.id, lease: nextLease } : { kind: 'wait' };
      }
      return { kind: 'ready', response: this.questionDraftResponse(existing, context, requestSpec) };
    }

    try {
      const lease = this.newQuestionDraftLease(1);
      const generation = await this.prisma.aiGeneration.create({
        data: {
          teacherId: context.teacherId,
          type: 'question-drafts',
          prompt: '',
          output: '',
          model: 'pending',
          sourceType: context.sourceType,
          sourceId: context.sourceId,
          status: 'generating',
          requestSpec: this.storedQuestionDraftRequestSpec(requestSpec, lease) as Prisma.InputJsonValue,
          contextSnapshot: this.contextSnapshot(context) as Prisma.InputJsonValue,
          idempotencyKey: dto.idempotencyKey,
        },
        select: { id: true },
      });
      return { kind: 'claimed', id: generation.id, lease };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError)
        || error.code !== 'P2002'
      ) {
        throw error;
      }
      return { kind: 'wait' };
    }
  }

  private async waitForQuestionDraftGeneration(
    context: ResolvedQuestionSourceContext,
    dto: GenerateQuestionDraftDto,
    requestSpec: Record<string, unknown>,
  ): Promise<{ generationId: string; model: string; source: ReturnType<AiGenerateService['contextSnapshot']>; items: QuestionDraftItem[] }> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await this.delay(250);
      const existing = await this.prisma.aiGeneration.findFirst({
        where: { teacherId: context.teacherId, type: 'question-drafts', idempotencyKey: dto.idempotencyKey },
        select: { id: true, requestSpec: true, output: true, model: true, status: true },
      });
      if (!existing) continue;
      this.assertQuestionDraftRequestMatches(existing.requestSpec, requestSpec);
      if (existing.status === 'generating') continue;
      if (existing.status === 'failed') {
        throw new ConflictException('Generate draft AI sebelumnya gagal. Gunakan idempotency key baru untuk mencoba ulang.');
      }
      return this.questionDraftResponse(existing, context, requestSpec);
    }
    throw new ConflictException('Generate draft AI masih diproses. Coba lagi beberapa saat lagi.');
  }

  private questionDraftResponse(
    generation: { id: string; requestSpec: unknown; output: string; model: string },
    context: ResolvedQuestionSourceContext,
    requestSpec: Record<string, unknown>,
  ): { generationId: string; model: string; source: ReturnType<AiGenerateService['contextSnapshot']>; items: QuestionDraftItem[] } {
    this.assertQuestionDraftRequestMatches(generation.requestSpec, requestSpec);
    if (!generation.output.trim()) {
      throw new ConflictException('Draft AI belum memiliki output valid');
    }
    return {
      generationId: generation.id,
      model: generation.model,
      source: this.contextSnapshot(context),
      items: QuestionDraftOutputSchema.parse(JSON.parse(generation.output)).items,
    };
  }

  private assertQuestionDraftRequestMatches(existingSpec: unknown, requestSpec: Record<string, unknown>): void {
    if (this.stableJson(this.questionDraftOriginalRequestSpec(existingSpec)) !== this.stableJson(requestSpec)) {
      throw new ConflictException('Idempotency key sudah dipakai untuk request berbeda');
    }
  }

  private storedQuestionDraftRequestSpec(requestSpec: Record<string, unknown>, lease: QuestionDraftLease): Record<string, unknown> {
    return { request: requestSpec, lease };
  }

  private questionDraftOriginalRequestSpec(storedSpec: unknown): unknown {
    if (!storedSpec || typeof storedSpec !== 'object' || Array.isArray(storedSpec)) return storedSpec;
    const maybeRequest = (storedSpec as { request?: unknown }).request;
    return maybeRequest && typeof maybeRequest === 'object' && !Array.isArray(maybeRequest)
      ? maybeRequest
      : storedSpec;
  }

  private questionDraftLease(storedSpec: unknown): QuestionDraftLease | null {
    if (!storedSpec || typeof storedSpec !== 'object' || Array.isArray(storedSpec)) return null;
    const lease = (storedSpec as { lease?: unknown }).lease;
    if (!lease || typeof lease !== 'object' || Array.isArray(lease)) return null;
    const candidate = lease as Partial<QuestionDraftLease>;
    if (
      typeof candidate.leaseId !== 'string'
      || typeof candidate.leaseExpiresAt !== 'string'
      || typeof candidate.leaseSequence !== 'number'
    ) {
      return null;
    }
    return {
      leaseId: candidate.leaseId,
      leaseExpiresAt: candidate.leaseExpiresAt,
      leaseSequence: candidate.leaseSequence,
    };
  }

  private newQuestionDraftLease(sequence: number): QuestionDraftLease {
    return {
      leaseId: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + QUESTION_DRAFT_LEASE_MS).toISOString(),
      leaseSequence: sequence,
    };
  }

  private isQuestionDraftLeaseExpired(lease: QuestionDraftLease | null): boolean {
    if (!lease) return true;
    const expiresAt = Date.parse(lease.leaseExpiresAt);
    return Number.isNaN(expiresAt) || expiresAt <= Date.now();
  }

  private async reclaimQuestionDraftGeneration(
    generationId: string,
    previousLease: QuestionDraftLease | null,
    requestSpec: Record<string, unknown>,
    nextLease: QuestionDraftLease,
  ): Promise<boolean> {
    const storedSpec = JSON.stringify(this.storedQuestionDraftRequestSpec(requestSpec, nextLease));
    const updated = previousLease
      ? await this.prisma.$executeRaw(Prisma.sql`
          UPDATE ai_knowledge.ai_generations
          SET status = 'generating',
              prompt = '',
              output = '',
              model = 'pending',
              request_spec = ${storedSpec}::jsonb
          WHERE id = ${generationId}::uuid
            AND status = 'generating'
            AND request_spec #>> '{lease,leaseId}' = ${previousLease.leaseId}
        `)
      : await this.prisma.$executeRaw(Prisma.sql`
          UPDATE ai_knowledge.ai_generations
          SET status = 'generating',
              prompt = '',
              output = '',
              model = 'pending',
              request_spec = ${storedSpec}::jsonb
          WHERE id = ${generationId}::uuid
            AND status = 'generating'
            AND request_spec #>> '{lease,leaseId}' IS NULL
        `);
    return updated === 1;
  }

  private async finalizeQuestionDraftGeneration(
    generationId: string,
    lease: QuestionDraftLease,
    prompt: string,
    output: string,
    model: AiCallResult['model'],
  ): Promise<{ id: string; model: string }> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; model: string }>>(Prisma.sql`
      UPDATE ai_knowledge.ai_generations
      SET prompt = ${prompt},
          output = ${output},
          model = ${model},
          status = 'drafted'
      WHERE id = ${generationId}::uuid
        AND status = 'generating'
        AND request_spec #>> '{lease,leaseId}' = ${lease.leaseId}
      RETURNING id, model
    `);
    const stored = rows[0];
    if (!stored) {
      throw new ConflictException('Lease generate draft AI sudah kedaluwarsa atau diambil proses lain. Muat ulang hasil terbaru.');
    }
    return stored;
  }

  private async markQuestionDraftGenerationFailed(
    generationId: string,
    lease: QuestionDraftLease,
    prompt: string,
    error: unknown,
  ): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ai_knowledge.ai_generations
      SET prompt = ${prompt},
          output = ${this.errorMessage(error).slice(0, 2000)},
          model = 'failed',
          status = 'failed'
      WHERE id = ${generationId}::uuid
        AND status = 'generating'
        AND request_spec #>> '{lease,leaseId}' = ${lease.leaseId}
    `).catch((updateError: unknown) => {
      logger.warn('[AiGenerateService] failed to mark question draft generation failed', {
        generationId,
        error: this.errorMessage(updateError),
      });
    });
  }

  private async callQuestionDraftAiWithBoundedRepair(
    prompt: string,
    dto: GenerateQuestionDraftDto,
    context: ResolvedQuestionSourceContext,
  ): Promise<{ ai: AiCallResult; parsed: { items: QuestionDraftItem[] } }> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const promptForAttempt = attempt === 0
        ? prompt
        : [
          prompt,
          'Output sebelumnya ditolak validator DIIS. Kembalikan ulang JSON object saja, tanpa markdown, field ekstra, KI/KD, PII, atau bentuk soal di luar schema.',
        ].join('\n');
      const ai = await this.callQuestionDraftAi(promptForAttempt, context.academicYear);
      try {
        return { ai, parsed: this.normalizeQuestionDraftOutput(ai.output, dto, context) };
      } catch (error) {
        lastError = error;
        if (!this.isAiOutputInvalid(error) || attempt === 1) throw error;
      }
    }
    throw lastError;
  }

  private async reloadQuestionGenerationContext(
    generation: { sourceType: string | null; sourceId: string | null },
    user: AuthUser,
  ): Promise<ResolvedQuestionSourceContext> {
    if (generation.sourceType !== 'rpp' && generation.sourceType !== 'module') {
      throw new ConflictException('Source context AI generation tidak valid');
    }
    if (!generation.sourceId) throw new ConflictException('Source context AI generation tidak lengkap');
    return this.loadQuestionSourceContext(
      generation.sourceType === 'rpp' ? { rppId: generation.sourceId } : { moduleId: generation.sourceId },
      user,
    );
  }

  private questionDraftSpecFromGeneration(
    requestSpec: Prisma.JsonValue | null,
    context: ResolvedQuestionSourceContext,
  ): Pick<GenerateQuestionDraftDto, 'purpose' | 'contextMode' | 'character' | 'teacherInstruction'> {
    const originalSpec = this.questionDraftOriginalRequestSpec(requestSpec);
    const spec = originalSpec && typeof originalSpec === 'object' && !Array.isArray(originalSpec)
      ? originalSpec as Record<string, unknown>
      : {};
    const purpose = spec['purpose'];
    const contextMode = spec['contextMode'];
    const character = spec['character'];
    const teacherInstruction = spec['teacherInstruction'];
    if (purpose !== 'diagnostik' && purpose !== 'formatif' && purpose !== 'sumatif-uts' && purpose !== 'sumatif-uas') {
      throw new ConflictException('Request spec draft AI tidak valid');
    }
    return {
      purpose,
      contextMode: contextMode === 'umum' || contextMode === 'auto_vokasi' || contextMode === 'produktif'
        ? contextMode
        : context.majorName ? 'auto_vokasi' : 'umum',
      character: character === 'konseptual' || character === 'studi_kasus' || character === 'praktik' || character === 'literasi' || character === 'numerasi'
        ? character
        : 'konseptual',
      teacherInstruction: typeof teacherInstruction === 'string' && teacherInstruction.trim() ? teacherInstruction : undefined,
    };
  }

  private async loadQuestionSourceContext(dto: { rppId?: string; moduleId?: string }, user: AuthUser): Promise<ResolvedQuestionSourceContext> {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    if (dto.rppId) {
      const resolved = await this.loadOwnedRppContext(dto.rppId, user);
      const tp = this.asStringArray(resolved.body['tp']);
      if (tp.length === 0) throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
      const major = resolved.rpp.class?.majorCode
        ? await this.prisma.major.findUnique({ where: { code: resolved.rpp.class.majorCode }, select: { name: true, description: true } })
        : null;
      return {
        teacherId,
        sourceType: 'rpp',
        sourceId: resolved.rpp.id,
        subject: resolved.rpp.subject,
        title: resolved.rpp.title,
        academicYear: resolved.rpp.academicYear,
        semester: resolved.rpp.semester,
        classId: resolved.rpp.classId!,
        className: resolved.rpp.class?.name ?? '',
        grade: resolved.rpp.class?.grade ?? null,
        majorName: major?.name ?? resolved.rpp.class?.majorCode ?? null,
        majorDescription: this.boundedMajorProductiveContext(major?.description ?? null) || null,
        tpOptions: tp.map((text, index) => ({ ref: `TP ${index + 1}`, text })),
        contentSummary: [
          this.asText(resolved.body['cp']),
          this.asText(resolved.body['materi']),
          this.asText(resolved.body['kegiatan']),
          this.asText(resolved.body['asesmen']),
        ].filter(Boolean).join('\n').slice(0, 6000),
      };
    }

    const module = await this.prisma.lmsModule.findFirst({
      where: { id: dto.moduleId, teacherId },
      select: {
        id: true, teacherId: true, classId: true, subject: true, title: true, tp: true,
        content: true, academicYear: true, semester: true,
        class: { select: { id: true, name: true, grade: true, majorCode: true } },
      },
    });
    if (!module) throw new ForbiddenException('Modul LMS tidak ditemukan atau bukan milik guru');
    if (!module.classId || !module.class) throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
    if (!module.tp) throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, classId: module.classId, subject: module.subject, academicYear: module.academicYear },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('Assignment mengajar untuk Modul LMS ini tidak aktif');
    const major = await this.prisma.major.findUnique({ where: { code: module.class.majorCode }, select: { name: true, description: true } });
    return {
      teacherId,
      sourceType: 'module',
      sourceId: module.id,
      subject: module.subject,
      title: module.title,
      academicYear: module.academicYear,
      semester: module.semester,
      classId: module.classId,
      className: module.class.name,
      grade: module.class.grade,
      majorName: major?.name ?? module.class.majorCode,
      majorDescription: this.boundedMajorProductiveContext(major?.description ?? null) || null,
      tpOptions: [{ ref: 'TP 1', text: module.tp }],
      contentSummary: (module.content ?? '').slice(0, 6000),
    };
  }

  private assertRequestedTpRefs(tpRefs: string[], context: ResolvedQuestionSourceContext): void {
    const allowed = new Set(context.tpOptions.map((tp) => tp.ref));
    const invalid = tpRefs.filter((ref) => !allowed.has(ref));
    if (invalid.length > 0) {
      throw new BadRequestException(`TP tidak valid untuk sumber ini: ${invalid.join(', ')}`);
    }
  }

  private generationRequestSpec(dto: GenerateQuestionDraftDto): Record<string, unknown> {
    return {
      source: dto.rppId ? { type: 'rpp', id: dto.rppId } : { type: 'module', id: dto.moduleId },
      purpose: dto.purpose,
      questionCount: dto.questionCount,
      typeDistribution: dto.typeDistribution,
      difficultyDistribution: dto.difficultyDistribution,
      cognitiveDistribution: dto.cognitiveDistribution,
      tpRefs: dto.tpRefs,
      contextMode: dto.contextMode,
      character: dto.character,
      teacherInstruction: dto.teacherInstruction ?? null,
    };
  }

  private contextSnapshot(context: ResolvedQuestionSourceContext): Record<string, unknown> {
    return {
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      subject: context.subject,
      title: context.title,
      academicYear: context.academicYear,
      semester: context.semester,
      classId: context.classId,
      className: context.className,
      grade: context.grade,
      majorName: context.majorName,
      majorDescription: context.majorDescription,
      tpOptions: context.tpOptions,
    };
  }

  private buildQuestionDraftPrompt(dto: GenerateQuestionDraftDto, context: ResolvedQuestionSourceContext): string {
    this.assertProductiveContextConfigured(dto, context);
    return [
      'Anda membuat draft soal untuk Bank Soal DIIS. Kembalikan JSON object valid saja.',
      'Jangan memakai markdown, code fence, field ekstra, KI/KD, Kompetensi Inti, atau Kompetensi Dasar.',
      'Jangan menyertakan data pribadi siswa/guru.',
      `Mapel: ${context.subject}.`,
      `Judul sumber: ${context.title}.`,
      `Kelas: ${context.className}. Tahun ajaran: ${context.academicYear}. Semester: ${context.semester}.`,
      `Jurusan: ${dto.contextMode === 'umum' ? 'jangan pakai konteks vokasi' : context.majorName ?? 'umum'}.`,
      this.schoolCurriculumContextLine(dto, context),
      `Tujuan asesmen: ${dto.purpose}. Karakter soal: ${dto.character}.`,
      `Jumlah soal: ${dto.questionCount}. Distribusi tipe: ${JSON.stringify(dto.typeDistribution)}.`,
      `Distribusi kesulitan: ${JSON.stringify(dto.difficultyDistribution)}. Distribusi kognitif: ${JSON.stringify(dto.cognitiveDistribution)}.`,
      `TP dipilih: ${context.tpOptions.filter((tp) => dto.tpRefs.includes(tp.ref)).map((tp) => `${tp.ref}: ${tp.text}`).join(' | ')}.`,
      dto.teacherInstruction ? `Catatan guru: ${dto.teacherInstruction}.` : '',
      context.contentSummary ? `Ringkasan materi authoritative: ${context.contentSummary}` : '',
      'Setiap item wajib punya itemKey stabil, question, tpRefs, cognitiveLevel, rationale, warnings.',
      'question harus mengikuti salah satu type: multiple_choice, true_false, matching, essay.',
      'Untuk matching, question.pairs[].id adalah kode internal; question.pairs[].prompt adalah sisi kiri; question.pairs[].match adalah teks jawaban sisi kanan yang lengkap, bukan kode seperti M1/M2 atau pengulangan id.',
      'Untuk matching, question.answer wajib array {promptId, matchId}; promptId dan matchId sama-sama wajib berisi id dari question.pairs[].id. Jangan pakai object dengan key dinamis.',
      'Rubrik esai total weight tepat 100. Matching harus bijective. PG harus punya distraktor unik.',
    ].filter(Boolean).join('\n');
  }

  private schoolCurriculumContextLine(dto: GenerateQuestionDraftDto, context: ResolvedQuestionSourceContext): string {
    if (dto.contextMode === 'umum') {
      return 'Katalog konteks sekolah: gunakan konteks umum lintas jurusan; jangan memaksakan skenario vokasi.';
    }
    const hints = this.productiveContextHints(context.majorDescription);
    if (hints.length === 0) {
      const majorLabel = context.majorName ? ` untuk jurusan ${context.majorName}` : '';
      return `Katalog konteks umum-produktif sekolah${majorLabel}: belum dikonfigurasi di deskripsi jurusan; jangan menebak skenario vokasi, gunakan konteks mapel dan kelas tanpa data pribadi.`;
    }
    return `Katalog konteks umum-produktif sekolah: ${hints.join('; ')}.`;
  }

  private productiveContextHints(majorDescription: string | null): string[] {
    const bounded = this.boundedMajorProductiveContext(majorDescription);
    if (!bounded) return [];
    return bounded
      .split(/[.;\n]/)
      .map((item) => item.trim().replace(/\s+/g, ' '))
      .filter((item) => item.length >= 12)
      .map((item) => item.slice(0, MAJOR_PRODUCTIVE_HINT_MAX_CHARS))
      .slice(0, 4);
  }

  private assertProductiveContextConfigured(dto: GenerateQuestionDraftDto, context: ResolvedQuestionSourceContext): void {
    if (dto.contextMode === 'umum') return;
    if (this.productiveContextHints(context.majorDescription).length > 0) return;
    const majorLabel = context.majorName ? ` untuk jurusan ${context.majorName}` : '';
    throw new BadRequestException(
      `Konteks produktif${majorLabel} belum dikonfigurasi. Isi deskripsi jurusan di konfigurasi sekolah, atau pilih mode Umum.`,
    );
  }

  private boundedMajorProductiveContext(majorDescription: string | null): string {
    return (majorDescription ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, MAJOR_PRODUCTIVE_CONTEXT_MAX_CHARS);
  }

  private async callQuestionDraftAi(prompt: string, academicYear: string): Promise<AiCallResult> {
    const piiDetected = hasPii(prompt);
    if (piiDetected) {
      return this.callQuestionDraftProvider(this.gateway, stripPiiForLlm(prompt), 'ollama', academicYear);
    }
    if (this.openaiGateway && await this.providerStatus.shouldAttemptOpenAiProbe()) {
      try {
        const result = await this.callQuestionDraftProvider(this.openaiGateway, stripPiiForLlm(prompt), 'gpt-4.1-mini', academicYear);
        await this.providerStatus.markOpenAiRecovered();
        return result;
      } catch (err) {
        if (err instanceof HttpException) throw err;
        if (this.isOpenAiQuotaExhausted(err)) {
          const detailCode = err instanceof OpenAiProviderError ? err.code : null;
          await this.providerStatus.markOpenAiQuotaExhausted(detailCode);
          this.scheduleAdminOpenAiQuotaNotice();
          return this.callQuestionDraftProvider(this.gateway, stripPiiForLlm(prompt), 'ollama', academicYear);
        }
        throw this.mapProviderError(err, false);
      }
    }
    return this.callQuestionDraftProvider(this.gateway, stripPiiForLlm(prompt), 'ollama', academicYear);
  }

  private async callQuestionDraftProvider(
    gateway: AIGateway,
    promptForProvider: string,
    model: AiCallResult['model'],
    _academicYear: string,
  ): Promise<AiCallResult> {
    const responseFormat: AiChatOptions = {
      responseFormat: {
        type: 'json_schema',
        name: 'question_drafts',
        strict: true,
        schema: this.questionDraftJsonSchema(),
      },
    };
    const output = await gateway.chat(promptForProvider, undefined, responseFormat);
    if (!output || output.trim().length === 0) throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    return { output, model, promptForAudit: promptForProvider };
  }

  private normalizeQuestionDraftOutput(
    rawOutput: string,
    dto: GenerateQuestionDraftDto,
    context: ResolvedQuestionSourceContext,
  ): { items: QuestionDraftItem[] } {
    if (FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(rawOutput))) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    parsed = this.normalizeQuestionDraftProviderOutput(parsed);
    const result = QuestionDraftOutputSchema.safeParse(parsed);
    if (!result.success) throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    if (result.data.items.length !== dto.questionCount) throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    this.assertDraftDistribution(result.data.items, dto);
    for (const item of result.data.items) {
      this.assertQuestionDraftItem(item, context);
    }
    return result.data;
  }

  private normalizeQuestionDraftProviderOutput(value: unknown): unknown {
    if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) return value;
    return {
      ...(value as Record<string, unknown>),
      items: ((value as { items: unknown[] }).items).map((item) => {
        if (!item || typeof item !== 'object') return item;
        const question = (item as { question?: unknown }).question;
        if (!question || typeof question !== 'object') return item;
        const typedQuestion = question as { type?: unknown; answer?: unknown };
        if (typedQuestion.type !== 'matching' || !Array.isArray(typedQuestion.answer)) return item;
        const matchingPairs = Array.isArray((typedQuestion as { pairs?: unknown }).pairs)
          ? (typedQuestion as { pairs: unknown[] }).pairs
            .filter((pair): pair is { id: string; match: string } =>
              Boolean(pair)
              && typeof pair === 'object'
              && typeof (pair as { id?: unknown }).id === 'string'
              && typeof (pair as { match?: unknown }).match === 'string')
          : [];
        const matchTextToId = new Map<string, string>();
        for (const pair of matchingPairs) {
          const normalizedMatchText = this.normalizedQuestionText(pair.match);
          if (normalizedMatchText && !matchTextToId.has(normalizedMatchText)) {
            matchTextToId.set(normalizedMatchText, pair.id);
          }
        }
        const answer = Object.fromEntries(
          typedQuestion.answer
            .filter((pair): pair is { promptId: string; matchId: string } =>
              Boolean(pair)
              && typeof pair === 'object'
              && typeof (pair as { promptId?: unknown }).promptId === 'string'
              && typeof (pair as { matchId?: unknown }).matchId === 'string')
            .map((pair) => {
              const normalizedMatchId = this.normalizedQuestionText(pair.matchId);
              return [pair.promptId, matchTextToId.get(normalizedMatchId) ?? pair.matchId];
            }),
        );
        return {
          ...(item as Record<string, unknown>),
          question: {
            ...(question as Record<string, unknown>),
            answer,
          },
        };
      }),
    };
  }

  private async assertNoQuestionDraftDuplicates(items: QuestionDraftItem[], teacherId: string, subject: string): Promise<void> {
    const bodies = items.map((item) => this.normalizedQuestionText(item.question.body));
    if (new Set(bodies).size !== bodies.length) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        if (this.textSimilarity(bodies[i]!, bodies[j]!) >= NEAR_DUPLICATE_THRESHOLD) {
          throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
        }
      }
    }
    const existing = await this.prisma.question.findMany({
      where: { teacherId, subject, body: { in: items.map((item) => item.question.body) } },
      select: { id: true },
      take: 1,
    });
    if (existing.length > 0) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
  }

  private assertDraftDistribution(items: QuestionDraftItem[], dto: GenerateQuestionDraftDto): void {
    const countBy = <T extends string>(values: T[]) => values.reduce<Record<T, number>>((acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {} as Record<T, number>);
    const typeCounts = countBy(items.map((item) => item.question.type));
    const difficultyCounts = countBy(items.map((item) => item.question.difficulty));
    const cognitiveCounts = countBy(items.map((item) => item.cognitiveLevel));
    for (const [type, count] of Object.entries(dto.typeDistribution)) {
      if ((typeCounts[type as keyof typeof typeCounts] ?? 0) !== count) throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    for (const [difficulty, count] of Object.entries(dto.difficultyDistribution)) {
      if ((difficultyCounts[difficulty as keyof typeof difficultyCounts] ?? 0) !== count) throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    for (const [level, count] of Object.entries(dto.cognitiveDistribution)) {
      if ((cognitiveCounts[level as keyof typeof cognitiveCounts] ?? 0) !== count) throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
  }

  private assertQuestionDraftItem(item: QuestionDraftItem, context: ResolvedQuestionSourceContext): void {
    QuestionPayloadSchema.parse(item.question);
    this.assertRequestedTpRefs(item.tpRefs, context);
    if (item.question.subject !== context.subject) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    const serialized = JSON.stringify(item);
    if (FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(serialized)) || hasPii(serialized)) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    const question = item.question;
    if (question.type === 'multiple_choice') {
      const optionTexts = question.options.map((option) => this.normalizedQuestionText(option.text));
      if (new Set(optionTexts).size !== optionTexts.length) {
        throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
      }
      if (question.options.some((option) => AMBIGUOUS_OPTION_PATTERNS.some((pattern) => pattern.test(option.text)))) {
        throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
      }
      const answerText = question.options.find((option) => option.id === question.answer)?.text.toLocaleLowerCase('id-ID') ?? '';
      if (answerText && question.body.toLocaleLowerCase('id-ID').includes(answerText)) {
        throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
      }
    }
    if (question.type === 'true_false' && /\btidak\b.+\bbukan\b|\bbukan\b.+\btidak\b/i.test(question.body)) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    if (question.type === 'matching') {
      this.assertMatchingQuestionQuality(question.pairs);
    }
    this.assertQuestionReadableForGrade(question.body, question.type, context.grade);
  }

  private assertMatchingQuestionQuality(pairs: Array<{ id: string; prompt: string; match: string }>): void {
    const promptTexts = pairs.map((pair) => this.normalizedQuestionText(pair.prompt));
    const matchTexts = pairs.map((pair) => this.normalizedQuestionText(pair.match));
    if (new Set(promptTexts).size !== promptTexts.length || new Set(matchTexts).size !== matchTexts.length) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    if (pairs.some((pair) => {
      const match = pair.match.trim();
      return match.length < 4
        || match.toLocaleLowerCase('id-ID') === pair.id.trim().toLocaleLowerCase('id-ID')
        || /^[A-Za-z]?\d{1,3}$/i.test(match);
    })) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
  }

  private normalizedQuestionText(text: string): string {
    return text
      .toLocaleLowerCase('id-ID')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private textSimilarity(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter((token) => token.length > 2));
    const rightTokens = new Set(right.split(' ').filter((token) => token.length > 2));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return intersection / union;
  }

  private assertQuestionReadableForGrade(body: string, type: string, grade: number | null): void {
    const wordCount = this.normalizedQuestionText(body).split(' ').filter(Boolean).length;
    const effectiveGrade = grade ?? 10;
    const limit = type === 'essay' ? 90 : effectiveGrade <= 10 ? 55 : 65;
    if (wordCount > limit) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
  }

  private acceptanceFingerprint(items: AcceptQuestionDraftDto['items']): string {
    return this.questionFingerprint({
      items: [...items]
        .sort((left, right) => left.itemKey.localeCompare(right.itemKey))
        .map((item) => ({
          itemKey: item.itemKey,
          question: item.question,
          tpRefs: [...item.tpRefs].sort(),
          cognitiveLevel: item.cognitiveLevel,
        })),
    });
  }

  private questionFingerprint(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private persistedQuestionFingerprint(value: unknown): string {
    return createHash('sha256').update(this.stableJson(this.normalizePersistedQuestionValue(value))).digest('hex');
  }

  private normalizePersistedQuestionValue(value: unknown): unknown {
    if (
      value === undefined ||
      value === Prisma.JsonNull ||
      value === Prisma.DbNull ||
      value === Prisma.AnyNull
    ) {
      return null;
    }
    if (Array.isArray(value)) return value.map((item) => this.normalizePersistedQuestionValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([key, nested]) => [key, this.normalizePersistedQuestionValue(nested)]),
      );
    }
    return value;
  }

  private async withInProcessLock<T>(lockName: string, callback: () => Promise<T>): Promise<T> {
    const previous = this.inProcessLocks.get(lockName) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.inProcessLocks.set(lockName, current);

    await previous.catch(() => undefined);
    try {
      return await callback();
    } finally {
      release();
      if (this.inProcessLocks.get(lockName) === current) {
        this.inProcessLocks.delete(lockName);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private stableJson(value: unknown): string {
    const normalize = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(normalize);
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.entries(input as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, normalize(nested)]),
        );
      }
      return input;
    };
    return JSON.stringify(normalize(value));
  }

  private isAiOutputInvalid(error: unknown): boolean {
    if (!(error instanceof HttpException)) return false;
    const response = error.getResponse();
    return Boolean(
      response
      && typeof response === 'object'
      && 'error' in response
      && (response as { error?: unknown }).error === 'AI_OUTPUT_INVALID',
    );
  }

  private questionDraftJsonSchema(): Record<string, unknown> {
    const baseProperties = {
      subject: { type: 'string' },
      body: { type: 'string' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
      tags: { type: 'array', maxItems: 20, items: { type: 'string' } },
    };
    const optionSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'text'],
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
      },
    };
    const rubricSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'description', 'weight', 'maxScore'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        weight: { type: 'number' },
        maxScore: { type: 'number' },
      },
    };
    const matchingPairSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'prompt', 'match'],
      properties: {
        id: { type: 'string', description: 'Kode internal pasangan, misalnya p1, p2. Dipakai ulang oleh answer.promptId dan answer.matchId.' },
        prompt: { type: 'string', description: 'Teks sisi kiri yang dilihat siswa, misalnya Router.' },
        match: { type: 'string', description: 'Teks jawaban sisi kanan yang lengkap, misalnya Menghubungkan dua jaringan. Jangan isi dengan M1, M2, atau id.' },
      },
    };
    const questionShape = {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'type', 'body', 'difficulty', 'tags', 'options', 'answer'],
          properties: {
            ...baseProperties,
            type: { type: 'string', enum: ['multiple_choice'] },
            options: { type: 'array', minItems: 2, maxItems: 6, items: optionSchema },
            answer: { type: 'string' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'type', 'body', 'difficulty', 'tags', 'answer'],
          properties: {
            ...baseProperties,
            type: { type: 'string', enum: ['true_false'] },
            answer: { type: 'boolean' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'type', 'body', 'difficulty', 'tags', 'pairs', 'answer'],
          properties: {
            ...baseProperties,
            type: { type: 'string', enum: ['matching'] },
            pairs: { type: 'array', minItems: 2, maxItems: 20, items: matchingPairSchema },
            answer: {
              type: 'array',
              minItems: 2,
              maxItems: 20,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['promptId', 'matchId'],
                properties: {
                  promptId: { type: 'string', description: 'Harus sama dengan salah satu question.pairs[].id.' },
                  matchId: { type: 'string', description: 'Harus sama dengan salah satu question.pairs[].id yang menjadi pasangan benar, bukan teks match dan bukan M1/M2.' },
                },
              },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['subject', 'type', 'body', 'difficulty', 'tags', 'guideAnswer', 'rubric'],
          properties: {
            ...baseProperties,
            type: { type: 'string', enum: ['essay'] },
            guideAnswer: { type: 'string' },
            rubric: { type: 'array', minItems: 1, maxItems: 12, items: rubricSchema },
          },
        },
      ],
    };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['itemKey', 'question', 'tpRefs', 'cognitiveLevel', 'rationale', 'warnings'],
            properties: {
              itemKey: { type: 'string' },
              question: questionShape,
              tpRefs: { type: 'array', items: { type: 'string' } },
              cognitiveLevel: { type: 'string', enum: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] },
              rationale: { type: 'string' },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    };
  }

  private async loadOwnedRppContext(rppId: string, user: AuthUser): Promise<ResolvedRppContext> {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const rpp = await this.prisma.rpp.findFirst({
      where: { id: rppId, teacherId },
      select: {
        id: true,
        teacherId: true,
        classId: true,
        subject: true,
        title: true,
        body: true,
        academicYear: true,
        semester: true,
        class: { select: { id: true, name: true, grade: true, majorCode: true } },
      },
    });

    if (!rpp) {
      throw new ForbiddenException('Akses Modul Ajar ditolak');
    }
    if (!rpp.classId) {
      throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
    }

    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: {
        teacherId,
        classId: rpp.classId,
        subject: rpp.subject,
        academicYear: rpp.academicYear,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Assignment mengajar untuk Modul Ajar ini tidak aktif');
    }

    return { teacherId, rpp, body: this.toBodyRecord(rpp.body) };
  }

  private assertSectionFoundation(section: AiRppSection, body: Record<string, unknown>): void {
    const cp = this.asText(body['cp']);
    const tp = this.asStringArray(body['tp']);
    if (section === 'cp_tp' && !cp) {
      throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
    }
    if ((section === 'atp' || section === 'kegiatan' || section === 'asesmen') && (!cp || tp.length === 0)) {
      throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
    }
  }

  private async callAi(
    prompt: string,
    section: AiRppSection,
    academicYear: string,
    rpp: RppForAi,
    body: Record<string, unknown>,
  ): Promise<AiCallResult> {
    const piiDetected = hasPii(prompt);
    const promptForProvider = stripPiiForLlm(prompt);
    const ollamaPromptForProvider = stripPiiForLlm(this.buildOllamaFallbackPrompt(section, rpp, body));

    if (!piiDetected && this.openaiGateway && await this.providerStatus.shouldAttemptOpenAiProbe()) {
      try {
        const result = await this.callOpenAiWithRateLimitRetry(promptForProvider, section, academicYear);
        await this.providerStatus.markOpenAiRecovered();
        return result;
      } catch (err) {
        if (err instanceof HttpException) throw err;
        if (this.isOpenAiQuotaExhausted(err)) {
          const detailCode = err instanceof OpenAiProviderError ? err.code : null;
          await this.providerStatus.markOpenAiQuotaExhausted(detailCode);
          this.scheduleAdminOpenAiQuotaNotice();
          logger.warn('[AiGenerateService] OpenAI quota exhausted; falling back to Ollama');
          return this.callFallbackProvider(ollamaPromptForProvider, section, academicYear);
        }
        throw this.mapProviderError(err, false);
      }
    }

    try {
      return await this.callProvider(this.gateway, ollamaPromptForProvider, 'ollama', section, academicYear);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw this.mapProviderError(err, piiDetected);
    }
  }

  private async callOpenAiWithRateLimitRetry(
    promptForProvider: string,
    section: AiRppSection,
    academicYear: string,
  ): Promise<AiCallResult> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= OPENAI_RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.callProvider(this.openaiGateway as AIGateway, promptForProvider, 'gpt-4.1-mini', section, academicYear);
      } catch (err) {
        lastErr = err;
        if (
          !(err instanceof OpenAiProviderError) ||
          this.isOpenAiQuotaExhausted(err) ||
          !this.isOpenAiTemporaryRateLimit(err) ||
          attempt >= OPENAI_RATE_LIMIT_MAX_ATTEMPTS
        ) {
          throw err;
        }
        const retryDelayMs = this.openAiRetryDelayMs(err, attempt);
        if (retryDelayMs === null) throw err;
        await this.sleep(retryDelayMs);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async callFallbackProvider(
    promptForProvider: string,
    section: AiRppSection,
    academicYear: string,
  ): Promise<AiCallResult> {
    try {
      return await this.callProvider(this.gateway, promptForProvider, 'ollama', section, academicYear);
    } catch (fallbackErr) {
      if (fallbackErr instanceof HttpException) throw fallbackErr;
      throw this.mapProviderError(fallbackErr, false);
    }
  }

  private async callProvider(
    gateway: AIGateway,
    promptForProvider: string,
    model: AiCallResult['model'],
    section: AiRppSection,
    academicYear: string,
  ): Promise<AiCallResult> {
    const output = await gateway.chat(promptForProvider, undefined, this.responseFormatFor(section, academicYear, model));
    if (!output || output.trim().length === 0) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    return { output, model, promptForAudit: promptForProvider };
  }

  private responseFormatFor(section: AiRppSection, academicYear: string, model: AiCallResult['model']): AiChatOptions {
    if (model === 'ollama') {
      return { responseFormat: 'json_object' };
    }

    return {
      responseFormat: {
        type: 'json_schema',
        name: `rpp_${section}_patch`,
        strict: true,
        schema: this.jsonSchemaFor(section, academicYear),
      },
    };
  }

  private jsonSchemaFor(section: AiRppSection, academicYear: string): Record<string, unknown> {
    // Keep provider schemas portable across OpenAI Structured Outputs and Ollama
    // structured format. Length, count, and pattern quality gates remain enforced
    // by Zod after the provider returns JSON.
    const text = { type: 'string' };
    const shortText = { type: 'string' };
    const object = (properties: Record<string, unknown>) => ({
      type: 'object',
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    });

    switch (section) {
      case 'cp_tp':
        return object({
          tp: { type: 'array', items: text },
        });
      case 'atp':
        return object({
          atp: {
            type: 'array',
            items: object({
              tpRef: { type: 'string' },
              indikator: text,
            }),
          },
        });
      case 'profil':
        return object({
          profilDimensi: {
            type: 'array',
            items: { type: 'string', enum: [...this.profileDimensionsFor(academicYear)] },
          },
          profilUraian: text,
        });
      case 'sarana':
        return object({
          sarana: text,
          target: text,
        });
      case 'kegiatan':
        return object({
          kegiatan: {
            type: 'array',
            items: object({
              pertemuan: shortText,
              pendahuluan: text,
              inti: text,
              penutup: text,
              diferensiasi: text,
            }),
          },
        });
      case 'asesmen':
        return object({
          asesmenDiagnostik: text,
          asesmenFormatif: text,
          asesmenSumatif: text,
        });
      case 'remedial':
        return object({
          pengayaan: text,
          remedial: text,
        });
      case 'refleksi':
        return object({
          refleksiGuru: text,
          refleksiSiswa: text,
        });
      case 'lampiran':
        return object({
          lampiran: text,
        });
    }
  }

  private isOpenAiQuotaExhausted(err: unknown): boolean {
    if (!(err instanceof OpenAiProviderError)) return false;
    return !!err.code && OPENAI_QUOTA_ERROR_CODES.has(err.code);
  }

  private isOpenAiTemporaryRateLimit(err: OpenAiProviderError): boolean {
    if (err.status !== 429) return false;
    if (err.code && OPENAI_QUOTA_ERROR_CODES.has(err.code)) return false;
    return !err.code || OPENAI_RATE_LIMIT_ERROR_CODES.has(err.code) || err.type === 'rate_limit_exceeded';
  }

  private openAiRetryDelayMs(err: OpenAiProviderError, attempt: number): number | null {
    const retryAfterMs = err.retryAfterSeconds !== null ? err.retryAfterSeconds * 1000 : null;
    if (retryAfterMs !== null && retryAfterMs > OPENAI_RATE_LIMIT_MAX_DELAY_MS) return null;
    const fallbackMs = 250 * (2 ** (attempt - 1));
    return retryAfterMs ?? Math.min(fallbackMs, OPENAI_RATE_LIMIT_MAX_DELAY_MS);
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private scheduleAdminOpenAiQuotaNotice(): void {
    void this.notifyAdminsOpenAiQuotaFallback();
  }

  private async notifyAdminsOpenAiQuotaFallback(): Promise<void> {
    if (!this.notificationService) {
      logger.warn('[AiGenerateService] OpenAI quota notice skipped: NotificationService unavailable');
      return;
    }

    const incidentId = await this.providerStatus.claimOpenAiQuotaNoticeIncident();
    if (!incidentId) return;

    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', isActive: true },
        select: { id: true, fullName: true, email: true, phone: true },
        take: 10,
      });

      const body =
        'Kuota/kredit atau batas penggunaan OpenAI DIIS telah tercapai. ' +
        'Sistem otomatis memakai Ollama lokal agar Generate Modul Ajar tetap berjalan. ' +
        'Mohon periksa billing/usage OpenAI, lalu lakukan rotasi OPENAI_API_KEY hanya melalui prosedur secret-management resmi bila diperlukan.';

      let sentCount = 0;
      for (const admin of admins) {
        const phone = admin.phone?.trim();
        const email = admin.email?.trim();
        const channel = phone ? 'whatsapp' : 'email';
        const to = phone || email;
        if (!to) continue;

        try {
          await this.notificationService.notify({
            channel,
            to,
            subject: 'OpenAI fallback aktif',
            body,
            refType: 'ai_openai_quota',
            refId: incidentId,
          });
          sentCount++;
        } catch (err) {
          logger.warn('[AiGenerateService] OpenAI quota notice recipient failed (fail-soft)', {
            adminId: admin.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (sentCount === 0) {
        await this.providerStatus.releaseOpenAiQuotaNoticeIncident(incidentId);
      }
    } catch (err) {
      await this.providerStatus.releaseOpenAiQuotaNoticeIncident(incidentId);
      logger.warn('[AiGenerateService] OpenAI quota notice failed (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private mapProviderError(err: unknown, piiDetected: boolean): HttpException {
    if (piiDetected) {
      return this.aiException('AI_CONTEXT_PII_BLOCKED', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (err instanceof OpenAiProviderError) {
      if (this.isOpenAiTemporaryRateLimit(err)) {
        return this.aiException('AI_PROVIDER_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (err.status === 401 || err.status === 403 || err.code === 'invalid_api_key') {
        return this.aiException('AI_PROVIDER_AUTH_FAILED', HttpStatus.SERVICE_UNAVAILABLE);
      }
      if (err.status >= 500) {
        return this.aiException('AI_PROVIDER_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
      }
    }

    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (message.includes('rate_limit_exceeded')) {
      return this.aiException('AI_PROVIDER_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) {
      return this.aiException('AI_PROVIDER_TIMEOUT', HttpStatus.GATEWAY_TIMEOUT);
    }
    if (message.includes('401') || message.includes('403') || message.includes('auth')) {
      return this.aiException('AI_PROVIDER_AUTH_FAILED', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.aiException('AI_PROVIDER_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
  }

  private normalizeSectionOutput(
    section: AiRppSection,
    output: string,
    rpp: RppForAi,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const parsed = this.parseJsonObject(output);
    const schema = this.patchSchemaFor(section, rpp.academicYear);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }

    const patch = result.data as Record<string, unknown>;
    this.assertNoForbiddenOutput(patch);
    if (section === 'atp') this.assertAtpRefsMatchSavedTp(patch, body);
    return patch;
  }

  private parseJsonObject(output: string): unknown {
    const text = output.trim();
    if (!text.startsWith('{') || !text.endsWith('}') || text.includes('```')) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
      }
      return parsed;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
  }

  private patchSchemaFor(section: AiRppSection, academicYear: string): z.ZodType<unknown> {
    if (section === 'profil') {
      const dimensions = this.profileDimensionsFor(academicYear);
      return z.object({
        profilDimensi: z.array(z.enum(dimensions)).min(1).max(dimensions.length),
        profilUraian: TextField,
      }).strict();
    }
    return PatchSchemas[section];
  }

  private assertAtpRefsMatchSavedTp(patch: Record<string, unknown>, body: Record<string, unknown>): void {
    const tpCount = this.asStringArray(body['tp']).length;
    const allowed = new Set(Array.from({ length: tpCount }, (_, index) => `TP ${index + 1}`));
    const rows = patch['atp'];
    if (!Array.isArray(rows) || rows.some((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return true;
      const tpRef = String((row as Record<string, unknown>)['tpRef'] ?? '').trim().toUpperCase();
      return !allowed.has(tpRef.replace(/\s+/, ' '));
    })) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
  }

  private assertNoForbiddenOutput(value: unknown): void {
    if (typeof value === 'string') {
      if (FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(value))) {
        throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) this.assertNoForbiddenOutput(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) {
        this.assertNoForbiddenOutput(item);
      }
    }
  }

  private async auditGeneration(input: {
    teacherId: string;
    type: string;
    prompt: string;
    output: string;
    model: string;
  }): Promise<void> {
    const prompt = stripPiiForLlm(input.prompt).slice(0, 2000);
    const output = stripPiiForLlm(input.output).slice(0, 4000);
    try {
      await this.prisma.aiGeneration.create({
        data: {
          teacherId: input.teacherId,
          type: input.type,
          prompt,
          output,
          model: input.model,
          tokensUsed: Math.ceil((prompt.length + output.length) / 4),
        },
      });
    } catch (err) {
      logger.warn('[AiGenerateService] Failed to create audit trail (fail-soft)', {
        teacherId: input.teacherId,
        type: input.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private buildRppSectionPrompt(
    section: AiRppSection,
    rpp: RppForAi,
    body: Record<string, unknown>,
  ): string {
    const base = [
      'Anda membantu guru menyusun satu bagian Modul Ajar Kurikulum Merdeka.',
      'Gunakan hanya konteks tersimpan berikut. Jangan menambah data pribadi siswa/guru.',
      `Target bagian: ${SECTION_LABELS[section]}.`,
      `Mapel: ${rpp.subject}.`,
      `Judul: ${rpp.title}.`,
      `Tahun ajaran: ${rpp.academicYear}.`,
      `Semester: ${rpp.semester}.`,
      rpp.class ? `Kelas: ${rpp.class.name} (kelas ${rpp.class.grade}, jurusan ${rpp.class.majorCode}).` : '',
      this.asText(body['fase']) ? `Fase: ${this.asText(body['fase'])}.` : '',
      this.asText(body['model']) ? `Model pembelajaran: ${this.asText(body['model'])}.` : '',
      this.asNumberText(body['jpAllocation']) ? `Alokasi JP: ${this.asNumberText(body['jpAllocation'])}.` : '',
      this.asNumberText(body['durasiMenit']) ? `Durasi per JP: ${this.asNumberText(body['durasiMenit'])} menit.` : '',
    ].filter(Boolean);

    const foundation = [
      this.asText(body['cp']) ? `CP tersimpan:\n${this.asText(body['cp'])}` : '',
      this.asStringArray(body['tp']).length
        ? `TP tersimpan:\n${this.asStringArray(body['tp']).map((tp, index) => `${index + 1}. ${tp}`).join('\n')}`
        : '',
      this.asText(body['kompetensiAwal']) ? `Kompetensi awal:\n${this.asText(body['kompetensiAwal'])}` : '',
    ].filter(Boolean);

    const sectionContext = this.sectionSpecificContext(section, body, rpp.academicYear);
    const outputRule = this.sectionOutputRule(section, rpp.academicYear);

    return [
      ...base,
      foundation.length ? foundation.join('\n\n') : 'CP/TP belum tersimpan.',
      sectionContext,
      'Aturan keluaran wajib: kembalikan tepat satu JSON object valid. Tanpa markdown, tanpa code fence, tanpa heading dokumen penuh, tanpa teks pembuka/penutup.',
      'Dilarang memakai istilah Kompetensi Dasar, KI/KD, atau format Kurikulum 2013. Gunakan CP, TP, ATP, langkah pembelajaran, dan asesmen.',
      'Jangan membuat identitas personal, tautan palsu, nomor telepon, atau surel.',
      outputRule,
    ].filter(Boolean).join('\n\n').slice(0, 10000);
  }

  private sectionSpecificContext(section: AiRppSection, body: Record<string, unknown>, academicYear: string): string {
    switch (section) {
      case 'cp_tp':
        return [
          this.asText(body['kompetensiAwal']) ? `Kompetensi awal: ${this.asText(body['kompetensiAwal'])}` : '',
          'CP tersimpan adalah otoritatif. Usulkan TP terukur dari CP tersebut. Jangan mengubah atau menulis ulang CP. Jangan membuat ATP di bagian ini.',
        ].filter(Boolean).join('\n');
      case 'atp':
        return 'Susun urutan alur dari TP tersimpan. Jangan membuat TP baru.';
      case 'profil':
        return [
          `Gunakan hanya dimensi berikut untuk tahun ajaran ${academicYear}: ${this.profileDimensionsFor(academicYear).join('; ')}.`,
          this.asStringArray(body['profilDimensi']).length
            ? `Dimensi terpilih: ${this.asStringArray(body['profilDimensi']).join(', ')}.`
            : 'Dimensi belum dipilih; usulkan dimensi yang paling relevan dari daftar resmi di atas.',
          this.asText(body['profilUraian']) ? `Uraian saat ini:\n${this.asText(body['profilUraian'])}` : '',
        ].filter(Boolean).join('\n\n');
      case 'sarana':
        return [
          this.asText(body['sarana']) ? `Sarana saat ini:\n${this.asText(body['sarana'])}` : '',
          this.asText(body['target']) ? `Target peserta didik saat ini:\n${this.asText(body['target'])}` : '',
        ].filter(Boolean).join('\n\n');
      case 'kegiatan':
        return [
          'Buat kegiatan pendahuluan, inti, dan penutup untuk pertemuan pertama.',
          this.asText(body['model']) ? `Model pembelajaran: ${this.asText(body['model'])}` : '',
        ].filter(Boolean).join('\n');
      case 'asesmen':
        return 'Buat asesmen diagnostik, formatif, dan sumatif yang selaras dengan TP tersimpan.';
      case 'remedial':
        return [
          this.asText(body['kktp']) ? `KKTP: ${this.asText(body['kktp'])}.` : '',
          'Buat pengayaan untuk siswa tuntas dan remedial untuk siswa belum tuntas.',
        ].filter(Boolean).join('\n');
      case 'refleksi':
        return 'Buat pertanyaan refleksi untuk guru dan peserta didik.';
      case 'lampiran':
        return 'Usulkan daftar lampiran belajar berupa teks/catatan. Jangan membuat tautan palsu.';
    }
  }

  private sectionOutputRule(section: AiRppSection, academicYear: string): string {
    switch (section) {
      case 'cp_tp':
        return 'Schema JSON: {"tp":["TP operasional pertama","TP operasional kedua"]}. Field "cp" tidak boleh ada.';
      case 'atp':
        return 'Schema JSON: {"atp":[{"tpRef":"TP 1","indikator":"indikator ketercapaian singkat"}]}. tpRef wajib memakai TP 1, TP 2, dst sesuai TP tersimpan.';
      case 'profil':
        return `Schema JSON: {"profilDimensi":["${this.profileDimensionsFor(academicYear)[0]}"],"profilUraian":"uraian aktivitas singkat dan kontekstual"}.`;
      case 'sarana':
        return 'Schema JSON: {"sarana":"alat, bahan, ruang, atau perangkat yang dibutuhkan","target":"karakteristik peserta didik target"}.';
      case 'kegiatan':
        return 'Schema JSON: {"kegiatan":[{"pertemuan":"Pertemuan 1","pendahuluan":"aktivitas pembuka","inti":"aktivitas inti","penutup":"aktivitas penutup","diferensiasi":"strategi diferensiasi bila relevan"}]}.';
      case 'asesmen':
        return 'Schema JSON: {"asesmenDiagnostik":"rencana diagnostik","asesmenFormatif":"rencana formatif","asesmenSumatif":"rencana sumatif"}.';
      case 'remedial':
        return 'Schema JSON: {"pengayaan":"aktivitas untuk peserta didik tuntas","remedial":"aktivitas bantuan untuk peserta didik belum tuntas"}.';
      case 'refleksi':
        return 'Schema JSON: {"refleksiGuru":"pertanyaan refleksi guru","refleksiSiswa":"pertanyaan refleksi peserta didik"}.';
      case 'lampiran':
        return 'Schema JSON: {"lampiran":"daftar lampiran belajar yang perlu disiapkan guru"}.';
    }
  }

  private buildOllamaFallbackPrompt(section: AiRppSection, rpp: RppForAi, body: Record<string, unknown>): string {
    const patch = this.buildDeterministicFallbackPatch(section, rpp, body);
    return [
      'Kembalikan hanya JSON object berikut tanpa perubahan.',
      'Tanpa markdown, tanpa code fence, tanpa teks pembuka/penutup.',
      JSON.stringify(patch),
    ].join('\n');
  }

  private buildDeterministicFallbackPatch(
    section: AiRppSection,
    rpp: RppForAi,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const subject = this.asText(rpp.subject) || 'mata pelajaran';
    const title = this.asText(rpp.title) || 'topik pembelajaran';
    const model = this.asText(body['model']) || 'pembelajaran aktif';
    const tp = this.asStringArray(body['tp']);
    const firstTp = tp[0] || `Memahami konsep utama ${title}.`;

    switch (section) {
      case 'cp_tp':
        return {
          tp: [
            `Menjelaskan konsep utama ${title} berdasarkan CP tersimpan.`,
            `Menerapkan konsep ${title} dalam tugas pembelajaran ${subject}.`,
          ],
        };
      case 'atp':
        return {
          atp: tp.map((item, index) => ({
            tpRef: `TP ${index + 1}`,
            indikator: `Menunjukkan ketercapaian: ${item}.`,
          })),
        };
      case 'profil': {
        const dimensions = this.profileDimensionsFor(rpp.academicYear);
        const selected = this.asStringArray(body['profilDimensi'])
          .filter((item): item is typeof dimensions[number] => (dimensions as readonly string[]).includes(item));
        return {
          profilDimensi: selected.length ? selected.slice(0, 2) : [dimensions[0]],
          profilUraian: `Peserta didik menguatkan karakter melalui aktivitas ${title} yang selaras dengan pembelajaran ${subject}.`,
        };
      }
      case 'sarana':
        return {
          sarana: this.asText(body['sarana']) || `Perangkat belajar, bahan ajar, dan lembar kerja untuk ${title}.`,
          target: this.asText(body['target']) || `Peserta didik yang mempelajari ${subject} pada topik ${title}.`,
        };
      case 'kegiatan':
        return {
          kegiatan: [{
            pertemuan: 'Pertemuan 1',
            pendahuluan: `Guru membuka pembelajaran ${title}, menyampaikan tujuan, dan mengaitkan materi dengan pengalaman peserta didik.`,
            inti: `Peserta didik mengikuti aktivitas ${model} untuk memahami ${firstTp.toLowerCase()}`,
            penutup: `Guru dan peserta didik menyimpulkan pembelajaran ${title} serta mencatat tindak lanjut.`,
            diferensiasi: 'Guru memberi dukungan bertahap, pilihan sumber belajar, dan tantangan lanjutan sesuai kesiapan peserta didik.',
          }],
        };
      case 'asesmen':
        return {
          asesmenDiagnostik: `Tanya jawab awal untuk memetakan pemahaman peserta didik tentang ${title}.`,
          asesmenFormatif: `Observasi proses dan cek pemahaman selama aktivitas ${subject}.`,
          asesmenSumatif: `Produk atau tugas akhir yang membuktikan ketercapaian ${firstTp.toLowerCase()}`,
        };
      case 'remedial':
        return {
          pengayaan: `Peserta didik tuntas mengerjakan tantangan lanjutan terkait ${title}.`,
          remedial: `Peserta didik belum tuntas mendapat bimbingan ulang dan latihan bertahap tentang ${title}.`,
        };
      case 'refleksi':
        return {
          refleksiGuru: `Bagian mana dari pembelajaran ${title} yang perlu diperkuat pada pertemuan berikutnya?`,
          refleksiSiswa: `Apa hal utama yang sudah saya pahami dari pembelajaran ${title}?`,
        };
      case 'lampiran':
        return {
          lampiran: `Lembar kerja, rubrik asesmen, dan bahan pendukung untuk pembelajaran ${title}.`,
        };
    }
  }

  private profileDimensionsFor(academicYear: string): typeof GRADUATE_PROFILE_DIMENSIONS | typeof LEGACY_PANCASILA_DIMENSIONS {
    const startYear = Number(academicYear.match(/^(\d{4})\/\d{4}$/)?.[1] ?? 0);
    return startYear >= 2025 ? GRADUATE_PROFILE_DIMENSIONS : LEGACY_PANCASILA_DIMENSIONS;
  }

  private toBodyRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private asText(value: unknown): string {
    if (typeof value === 'string') return value.trim().slice(0, 3000);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  private asNumberText(value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  private aiException(code: AiErrorCode, status: HttpStatus): HttpException {
    return new HttpException({ message: code, error: code }, status);
  }
}
