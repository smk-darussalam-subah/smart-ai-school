// =============================================================================
// ClaudeAdapter — implements AIGateway via Anthropic Claude API
//
// ⚠️ GERBANG REGULASI (R-03, UU PDP):
//   - EMBEDDING tidak dilakukan via Claude — gunakan OllamaAdapter.
//   - Semua teks di-strip PII via stripPiiForLlm() sebelum dikirim (belt-and-suspenders).
//   - Adapter ini HANYA dipakai setelah decision tree di AiService memverifikasi
//     tidak ada PII dalam input.
//
// Env yang diperlukan (diset oleh factory di ai.module.ts):
//   ANTHROPIC_API_KEY  — API key Anthropic (opsional; tanpa key → factory return null)
//
// Model: claude-haiku-4-5-20251001 (cepat + murah, cukup untuk FAQ reasoning)
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { AIGateway, RagContext } from '@smk/types';
import { stripPiiForLlm } from './pii-strip.utils';

export class ClaudeAdapter implements AIGateway {
  private readonly client: Anthropic;
  private readonly model = 'claude-haiku-4-5-20251001';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Embedding TIDAK didukung oleh ClaudeAdapter.
   * Embedding wajib menggunakan OllamaAdapter (lokal, data tidak keluar).
   */
  async embed(_text: string): Promise<number[]> {
    throw new Error(
      'ClaudeAdapter tidak mendukung embed() — gunakan OllamaAdapter untuk embedding (R-03)',
    );
  }

  /**
   * Chat via Claude Haiku.
   * Strip PII (belt-and-suspenders) sebelum kirim — bahkan jika caller sudah strip.
   * Idempoten: placeholder [EMAIL]/[HP]/[NIS]/[NAMA] tidak di-strip ulang.
   */
  async chat(prompt: string, context?: RagContext[]): Promise<string> {
    const safePrompt = stripPiiForLlm(prompt);

    const systemContent =
      'Kamu adalah asisten AI untuk sekolah. ' +
      'Jawab pertanyaan berdasarkan konteks yang diberikan. ' +
      'Jika tidak ada konteks atau informasi tidak tersedia, ' +
      'katakan bahwa kamu tidak memiliki informasi tersebut.';

    let userContent = safePrompt;
    if (context && context.length > 0) {
      const contextText = context
        .map((c) => `### ${c.title}\n${stripPiiForLlm(c.content)}`)
        .join('\n\n');
      userContent = `Konteks:\n\n${contextText}\n\nPertanyaan: ${safePrompt}`;
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemContent,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('ClaudeAdapter: respons tidak mengandung text block');
    }
    return textBlock.text;
  }
}
