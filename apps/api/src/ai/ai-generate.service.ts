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
  GenerateRppStepDto,
} from './dto/generate.dto';

@Injectable()
export class AiGenerateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
    @Inject('OPENAI_GATEWAY') private readonly openaiGateway: AIGateway | null,
  ) {}

  /** Generate questions from RPP body */
  async generateQuestions(dto: GenerateQuestionsDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const prompt = this.buildQuestionsPrompt(dto);
    const output = await this.callAi(prompt);
    await this.auditGeneration(teacherId, 'questions', prompt, output);
    return { type: 'questions', output: this.extractJson(output) };
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
    return { type: 'atp', output: this.extractJson(output) };
  }

  /** P4 (S-12): Generate RPP step content (CP/TP, Profil, Sarana, etc.) */
  async generateRppStep(dto: GenerateRppStepDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const prompt = this.buildRppStepPrompt(dto);
    const output = await this.callAi(prompt);
    await this.auditGeneration(teacherId, `rpp-${dto.step}`, prompt, output);
    return { type: dto.step, output };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * R-28: Call AI gateway with OpenAI preferred, Ollama as fallback.
   * Returns the raw text output from the LLM.
   */
  private async callAi(prompt: string): Promise<string> {
    const gw = this.openaiGateway ?? this.gateway;
    const result = await gw.chat(prompt);
    if (!result || result.trim().length === 0) {
      throw new Error('AI mengembalikan respons kosong');
    }
    return result;
  }

  /**
   * R-28: Returns the model name for audit trail — reflects which gateway was used.
   */
  private get activeModel(): string {
    return this.openaiGateway ? 'gpt-4.1-mini' : 'ollama';
  }

  /**
   * R-34: Robust JSON extraction from LLM output.
   * Handles: raw JSON, markdown code blocks (```json ... ```), and text+JSON mix.
   * Throws with an informative message if all strategies fail (no silent fallback).
   */
  private extractJson(output: string): unknown {
    // Strategy 1: Direct parse (fast path — clean JSON)
    try {
      return JSON.parse(output);
    } catch {
      // continue to next strategy
    }

    // Strategy 2: Extract from markdown code block ```json ... ``` or ``` ... ```
    const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // continue to next strategy
      }
    }

    // Strategy 3: Find first JSON array [...] or object {...} in the text
    const bracketMatch = output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (bracketMatch?.[1]) {
      try {
        return JSON.parse(bracketMatch[1]);
      } catch {
        // continue to next strategy
      }
    }

    // All strategies failed — throw with informative message (R-34: no silent fallback)
    throw new Error(
      'AI output tidak bisa di-parse sebagai JSON. ' +
        'Output (200 char pertama): ' +
        output.slice(0, 200),
    );
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
          model: this.activeModel,
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

  // P4 (S-12): Generic RPP step prompt builder
  private buildRppStepPrompt(dto: GenerateRppStepDto): string {
    const stepLabels: Record<string, string> = {
      cp_tp: 'Capaian Pembelajaran (CP) dan Tujuan Pembelajaran (TP)',
      profil: 'Profil Pelajar Pancasila (dimensi yang dikembangkan)',
      sarana: 'Sarana Prasarana dan profil peserta didik target',
      kegiatan: 'Kegiatan Pembelajaran (Pendahuluan, Inti, Penutup per pertemuan)',
      asesmen: 'Rencana penilaian (diagnostik, formatif, sumatif)',
      remedial: 'Pengayaan dan Remedial',
      refleksi: 'Refleksi Guru dan Peserta Didik',
      lampiran: 'Lampiran (handout, slide, lembar kerja)',
    };
    const label = stepLabels[dto.step] ?? dto.step;
    return `Sebagai guru ${dto.subject}, buatlah draf ${label} untuk Modul Ajar. ` +
      `Format markdown yang informatif dan siap dipakai.\n\n` +
      `Konteks dari langkah sebelumnya:\n${dto.context}\n\n` +
      `Berikan output yang konkret dan relevan dengan mapel ${dto.subject}.`;
  }
}
