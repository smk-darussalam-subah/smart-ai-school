import {
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { AIGateway } from '@smk/types';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTeacherId } from '../common/helpers/role-helpers';
import { AiRppSection, GenerateRppStepDto } from './dto/generate.dto';
import { hasPii, stripPiiForLlm } from './adapters/pii-strip.utils';

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

const SECTION_LABELS: Record<AiRppSection, string> = {
  cp_tp: 'Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP)',
  atp: 'Alur Tujuan Pembelajaran (ATP)',
  profil: 'Profil Pelajar Pancasila',
  sarana: 'Sarana prasarana dan target peserta didik',
  kegiatan: 'Kegiatan pembelajaran',
  asesmen: 'Rencana asesmen',
  remedial: 'Pengayaan dan remedial',
  refleksi: 'Refleksi guru dan peserta didik',
  lampiran: 'Catatan lampiran pembelajaran',
};

@Injectable()
export class AiGenerateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
    @Inject('OPENAI_GATEWAY') private readonly openaiGateway: AIGateway | null,
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
    const output = this.normalizeSectionOutput(dto.section, ai.output);

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
    if (section !== 'atp') return;
    const cp = this.asText(body['cp']);
    const tp = this.asStringArray(body['tp']);
    if (!cp || tp.length === 0) {
      throw this.aiException('AI_FOUNDATION_INCOMPLETE', HttpStatus.BAD_REQUEST);
    }
  }

  private async callAi(prompt: string): Promise<AiCallResult> {
    const piiDetected = hasPii(prompt);
    const promptForProvider = stripPiiForLlm(prompt);
    const gateway = !piiDetected && this.openaiGateway ? this.openaiGateway : this.gateway;
    const model = !piiDetected && this.openaiGateway ? 'gpt-4.1-mini' : 'ollama';

    try {
      const output = await gateway.chat(promptForProvider);
      if (!output || output.trim().length === 0) {
        throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
      }
      return { output, model, promptForAudit: promptForProvider };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw this.mapProviderError(err, piiDetected);
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

  private normalizeSectionOutput(section: AiRppSection, output: string): unknown {
    if (section !== 'atp') return output.trim();
    const parsed = this.extractJson(output);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
    }
    return parsed;
  }

  private extractJson(output: string): unknown {
    const candidates = [
      output,
      output.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1],
      output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)?.[1],
    ].filter((candidate): candidate is string => typeof candidate === 'string');

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate.trim());
      } catch {
        // Try the next candidate.
      }
    }
    throw this.aiException('AI_OUTPUT_INVALID', HttpStatus.BAD_GATEWAY);
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

    const sectionContext = this.sectionSpecificContext(section, body);
    const outputRule = section === 'atp'
      ? 'Kembalikan JSON array saja dengan bentuk [{"tpRef":"TP 1","indikator":"indikator singkat"}].'
      : 'Kembalikan markdown singkat yang langsung dapat disunting guru.';

    return [
      ...base,
      foundation.length ? foundation.join('\n\n') : 'CP/TP belum tersimpan.',
      sectionContext,
      outputRule,
    ].filter(Boolean).join('\n\n').slice(0, 10000);
  }

  private sectionSpecificContext(section: AiRppSection, body: Record<string, unknown>): string {
    switch (section) {
      case 'cp_tp':
        return [
          this.asText(body['kompetensiAwal']) ? `Kompetensi awal: ${this.asText(body['kompetensiAwal'])}` : '',
          'Bantu rumuskan CP dan TP terukur. Jangan membuat ATP di bagian ini.',
        ].filter(Boolean).join('\n');
      case 'atp':
        return 'Susun urutan alur dari TP tersimpan. Jangan membuat TP baru.';
      case 'profil':
        return [
          this.asStringArray(body['profilDimensi']).length
            ? `Dimensi terpilih: ${this.asStringArray(body['profilDimensi']).join(', ')}.`
            : 'Dimensi belum dipilih; usulkan dimensi yang relevan dari daftar Profil Pelajar Pancasila.',
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
