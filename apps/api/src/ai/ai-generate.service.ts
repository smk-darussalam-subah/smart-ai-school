// =============================================================================
// AiGenerateService — AI-powered content generation (P16 — W3-5).
// Generates questions, material, and ATP from RPP/CP/TP input.
// Uses AIGateway (Ollama or Claude) for generation.
// Audit trail: every generation is logged in AiGeneration table.
// =============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { AIGateway } from '@smk/types';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTeacherId } from '../common/helpers/role-helpers';
import {
  GenerateAtpDto,
  GenerateMaterialDto,
  GenerateQuestionsDto,
} from './dto/generate.dto';

@Injectable()
export class AiGenerateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
  ) {}

  /** Generate questions from RPP body */
  async generateQuestions(dto: GenerateQuestionsDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const prompt = this.buildQuestionsPrompt(dto);
    const output = await this.callAi(prompt);
    await this.auditGeneration(teacherId, 'questions', prompt, output);
    return { type: 'questions', output: JSON.parse(output) };
  }

  /** Generate learning material from RPP body */
  async generateMaterial(dto: GenerateMaterialDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const prompt = this.buildMaterialPrompt(dto);
    const output = await this.callAi(prompt);
    await this.auditGeneration(teacherId, 'material', prompt, output);
    return { type: 'material', output };
  }

  /** Generate ATP (Alur Tujuan Pembelajaran) from CP + TP */
  async generateAtp(dto: GenerateAtpDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const prompt = this.buildAtpPrompt(dto);
    const output = await this.callAi(prompt);
    await this.auditGeneration(teacherId, 'atp', prompt, output);
    return { type: 'atp', output: JSON.parse(output) };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async callAi(prompt: string): Promise<string> {
    const result = await this.gateway.chat(prompt);
    if (!result || result.trim().length === 0) {
      throw new Error('AI mengembalikan respons kosong');
    }
    return result;
  }

  private async auditGeneration(
    teacherId: string,
    type: string,
    prompt: string,
    output: string,
  ): Promise<void> {
    try {
      await this.prisma.aiGeneration.create({
        data: {
          teacherId,
          type,
          prompt,
          output,
          model: 'ollama',
          tokensUsed: Math.ceil((prompt.length + output.length) / 4),
        },
      });
    } catch (err) {
      logger.warn('[AiGenerateService] Failed to create audit trail (fail-soft)', {
        teacherId, type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private buildQuestionsPrompt(dto: GenerateQuestionsDto): string {
    const typeMap: Record<string, string> = {
      multiple_choice: 'pilihan ganda (dengan 4 opsi A-D dan kunci jawaban)',
      essay: 'uraian/esai',
      true_false: 'benar/salah',
    };
    return `Sebagai guru ${dto.subject}, buatlah ${dto.count} soal ${typeMap[dto.type] ?? 'pilihan ganda'} ` +
      `berdasarkan Rencana Pembelajaran berikut. Format output sebagai JSON array.\n\n` +
      `RPP:\n${dto.rppBody}\n\n` +
      `Format: [{"body": "pertanyaan", "options": ["A","B","C","D"], "answer": "A", "difficulty": "medium"}]`;
  }

  private buildMaterialPrompt(dto: GenerateMaterialDto): string {
    return `Sebagai guru ${dto.subject}, buatlah materi pembelajaran yang informatif ` +
      `dan mudah dipahami berdasarkan RPP berikut. Gunakan format markdown.\n\n` +
      `RPP:\n${dto.rppBody}`;
  }

  private buildAtpPrompt(dto: GenerateAtpDto): string {
    const tpList = dto.tp.map((t, i) => `${i + 1}. ${t}`).join('\n');
    return `Sebagai guru ${dto.subject}, susun Alur Tujuan Pembelajaran (ATP) ` +
      `berdasarkan Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP) berikut. ` +
      `Format output sebagai JSON array of objects.\n\n` +
      `CP: ${dto.cp}\n\nTP:\n${tpList}\n\n` +
      `Format: [{"code": "TP 1.1", "tp": "deskripsi", "atp": ["sub-tujuan 1", "sub-tujuan 2"]}]`;
  }
}
