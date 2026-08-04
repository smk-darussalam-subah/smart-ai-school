import {
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { AIGateway } from '@smk/types';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTeacherId } from '../common/helpers/role-helpers';
import { AiRppSection, GenerateRppStepDto } from './dto/generate.dto';
import { hasPii, stripPiiForLlm } from './adapters/pii-strip.utils';
import { NotificationService } from '../notification/notification.service';

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

type AiCallResult = {
  output: string;
  model: 'ollama' | 'gpt-4.1-mini';
  promptForAudit: string;
};

const OPENAI_QUOTA_NOTICE_THROTTLE_MS = 6 * 60 * 60 * 1000;
const OPENAI_QUOTA_NOTICE_REF_ID = '00000000-0000-4000-8000-0000000000a1';

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

const TextField = z.string().trim().min(3).max(3000);
const ShortTextField = z.string().trim().min(1).max(160);
const TpRefField = z.string().trim().regex(/^TP\s+\d+$/i);

const AtpItemSchema = z.object({
  tpRef: TpRefField,
  indikator: TextField,
}).strict();

const KegiatanItemSchema = z.object({
  pertemuan: ShortTextField,
  pendahuluan: TextField,
  inti: TextField,
  penutup: TextField,
  diferensiasi: TextField.optional(),
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
  private lastOpenAiQuotaNoticeAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
    @Inject('OPENAI_GATEWAY') private readonly openaiGateway: AIGateway | null,
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
    const ai = await this.callAi(prompt);
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

  private async callAi(prompt: string): Promise<AiCallResult> {
    const piiDetected = hasPii(prompt);
    const promptForProvider = stripPiiForLlm(prompt);

    if (!piiDetected && this.openaiGateway) {
      try {
        return await this.callProvider(this.openaiGateway, promptForProvider, 'gpt-4.1-mini');
      } catch (err) {
        if (err instanceof HttpException) throw err;
        if (this.isOpenAiQuotaExhausted(err)) {
          await this.notifyAdminsOpenAiQuotaFallback();
          logger.warn('[AiGenerateService] OpenAI quota exhausted; falling back to Ollama');
          return this.callFallbackProvider(promptForProvider);
        }
        throw this.mapProviderError(err, false);
      }
    }

    try {
      return await this.callProvider(this.gateway, promptForProvider, 'ollama');
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw this.mapProviderError(err, piiDetected);
    }
  }

  private async callFallbackProvider(promptForProvider: string): Promise<AiCallResult> {
    try {
      return await this.callProvider(this.gateway, promptForProvider, 'ollama');
    } catch (fallbackErr) {
      if (fallbackErr instanceof HttpException) throw fallbackErr;
      throw this.mapProviderError(fallbackErr, false);
    }
  }

  private async callProvider(
    gateway: AIGateway,
    promptForProvider: string,
    model: AiCallResult['model'],
  ): Promise<AiCallResult> {
    const output = await gateway.chat(promptForProvider);
    if (!output || output.trim().length === 0) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    return { output, model, promptForAudit: promptForProvider };
  }

  private isOpenAiQuotaExhausted(err: unknown): boolean {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return (
      message.includes('insufficient_quota') ||
      message.includes('exceeded your current quota') ||
      message.includes('quota') ||
      message.includes('billing') ||
      message.includes('credit')
    );
  }

  private async notifyAdminsOpenAiQuotaFallback(): Promise<void> {
    const now = Date.now();
    if (now - this.lastOpenAiQuotaNoticeAt < OPENAI_QUOTA_NOTICE_THROTTLE_MS) return;
    this.lastOpenAiQuotaNoticeAt = now;

    if (!this.notificationService) {
      logger.warn('[AiGenerateService] OpenAI quota notice skipped: NotificationService unavailable');
      return;
    }

    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', isActive: true },
        select: { id: true, fullName: true, email: true, phone: true },
        take: 10,
      });

      const body =
        'Kuota/token OpenAI DIIS habis atau ditolak provider. ' +
        'Sistem otomatis memakai Ollama lokal agar Generate Modul Ajar tetap berjalan. ' +
        'Mohon isi ulang kuota OpenAI atau rotasi OPENAI_API_KEY staging/production sesuai prosedur rahasia.';

      for (const admin of admins) {
        const phone = admin.phone?.trim();
        const email = admin.email?.trim();
        const channel = phone ? 'whatsapp' : 'email';
        const to = phone || email;
        if (!to) continue;

        await this.notificationService.notify({
          channel,
          to,
          subject: 'OpenAI fallback aktif',
          body,
          refType: 'ai_openai_quota',
          refId: OPENAI_QUOTA_NOTICE_REF_ID,
        });
      }
    } catch (err) {
      this.lastOpenAiQuotaNoticeAt = 0;
      logger.warn('[AiGenerateService] OpenAI quota notice failed (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private mapProviderError(err: unknown, piiDetected: boolean): HttpException {
    if (piiDetected) {
      return this.aiException('AI_CONTEXT_PII_BLOCKED', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (message.includes('429') || message.includes('rate')) {
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
