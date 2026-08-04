// =============================================================================
// OpenAiAdapter — implements AIGateway via OpenAI Chat Completions API
//
// R-28: Hybrid AI strategy — Ollama (embed) + OpenAI gpt-4.1-mini (chat/generate).
//
// ⚠️ GERBANG REGULASI (R-03, UU PDP):
//   - EMBEDDING tidak dilakukan via OpenAI — gunakan OllamaAdapter (data lokal).
//   - Semua teks di-strip PII via stripPiiForLlm() sebelum dikirim (belt-and-suspenders).
//   - Adapter ini HANYA dipakai setelah decision tree di AiService memverifikasi
//     tidak ada PII dalam input.
//
// API: https://api.openai.com/v1/chat/completions (native fetch — no SDK dependency)
// Model: gpt-4.1-mini (OpenAI) — released April 2025
//
// Env yang diperlukan (diset oleh factory di ai.module.ts):
//   OPENAI_API_KEY     — API key OpenAI (opsional; tanpa key → factory return null)
//   OPENAI_CHAT_MODEL  — model chat (default: gpt-4.1-mini)
// =============================================================================

import { AIGateway, RagContext } from '@smk/types';
import { stripPiiForLlm } from './pii-strip.utils';

/** OpenAI Chat Completions API response shape (minimal — hanya field yang dipakai). */
interface OpenAiChatResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

interface OpenAiErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string | null;
    param?: string | null;
  };
}

export class OpenAiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly type: string | null,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = 'OpenAiProviderError';
  }
}

export class OpenAiAdapter implements AIGateway {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly timeoutMs = 30_000;

  constructor(apiKey: string, model = 'gpt-4.1-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Embedding TIDAK didukung oleh OpenAiAdapter.
   * Embedding wajib menggunakan OllamaAdapter (lokal, data tidak keluar VPS).
   */
  async embed(_text: string): Promise<number[]> {
    throw new Error(
      'OpenAiAdapter tidak mendukung embed() — gunakan OllamaAdapter untuk embedding (R-03)',
    );
  }

  /**
   * Chat via OpenAI gpt-4.1-mini.
   * Strip PII (belt-and-suspenders) sebelum kirim — bahkan jika caller sudah strip.
   * Idempoten: placeholder [EMAIL]/[HP]/[NIS]/[NAMA] tidak di-strip ulang.
   *
   * @param prompt  Pertanyaan atau instruksi dari user
   * @param context Opsional: potongan konteks RAG untuk grounding jawaban
   */
  async chat(prompt: string, context?: RagContext[]): Promise<string> {
    const safePrompt = stripPiiForLlm(prompt);

    const systemContent =
      'Kamu adalah asisten AI untuk SMK Darussalam Subah. ' +
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

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let parsed: OpenAiErrorResponse | null = null;
      try {
        parsed = JSON.parse(errorBody) as OpenAiErrorResponse;
      } catch {
        parsed = null;
      }

      throw new OpenAiProviderError(
        sanitizeOpenAiErrorMessage(parsed?.error?.message ?? `OpenAI chat gagal: HTTP ${response.status}`),
        response.status,
        parsed?.error?.code ?? null,
        parsed?.error?.type ?? null,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }

    const data = (await response.json()) as OpenAiChatResponse;

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('OpenAI chat mengembalikan respons kosong atau tidak terduga');
    }

    return content;
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return null;
}

function sanitizeOpenAiErrorMessage(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED_OPENAI_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/g, 'Bearer [REDACTED]');
}
