// =============================================================================
// OllamaAdapter — implements AIGateway via Ollama REST API
//
// Env yang wajib dikonfigurasi:
//   OLLAMA_URL            → base URL Ollama (default: http://ollama:11434)
//   OLLAMA_CHAT_MODEL     → model chat (default: qwen2.5:7b)
//   OLLAMA_EMBED_MODEL    → model embed (default: nomic-embed-text)
//   OLLAMA_EMBED_DIMENSIONS → dimensi output embed (default: 768)
//
// Gate §2.1: dimensi HARUS == OLLAMA_EMBED_DIMENSIONS; jika tidak → throw Error
// Gunakan fetch bawaan Node 20 — tidak ada dependency tambahan.
// =============================================================================

import { AiChatOptions, AIGateway, RagContext } from '@smk/types';

export class OllamaAdapter implements AIGateway {
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embedModel: string;
  private readonly embedDimensions: number;
  private readonly chatTimeoutMs: number;

  constructor(
    baseUrl: string,
    chatModel: string,
    embedModel: string,
    embedDimensions: number,
    chatTimeoutMs = 90_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.chatModel = chatModel;
    this.embedModel = embedModel;
    this.embedDimensions = embedDimensions;
    this.chatTimeoutMs = Math.min(Math.max(Math.floor(chatTimeoutMs), 30_000), 180_000);
  }

  /**
   * Buat embedding vektor dari teks.
   * @throws Error jika panjang vektor != embedDimensions (gate §2.1)
   */
  async embed(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embedModel, prompt: text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama embed gagal: HTTP ${response.status} — ${body}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    const embedding = data.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Ollama embed mengembalikan embedding kosong atau bukan array');
    }

    if (embedding.length !== this.embedDimensions) {
      throw new Error(
        `Dimensi embedding tidak cocok: dapat ${embedding.length}, diharapkan ${this.embedDimensions}. ` +
          `Periksa OLLAMA_EMBED_MODEL dan OLLAMA_EMBED_DIMENSIONS (gate §2.1).`,
      );
    }

    return embedding;
  }

  /**
   * Chat dengan konteks RAG opsional.
   * Susun prompt: system + context chunks + pertanyaan user.
   */
  async chat(prompt: string, context?: RagContext[], options?: AiChatOptions): Promise<string> {
    const systemContent =
      'Kamu adalah asisten AI untuk SMK Darussalam Subah. ' +
      'Jawab pertanyaan berdasarkan konteks yang diberikan. ' +
      'Jika tidak ada konteks atau informasi tidak tersedia, ' +
      'katakan bahwa kamu tidak memiliki informasi tersebut.';

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemContent },
    ];

    if (context && context.length > 0) {
      const contextText = context
        .map((c) => `### ${c.title}\n${c.content}`)
        .join('\n\n');
      messages.push({
        role: 'system',
        content: `Konteks yang tersedia:\n\n${contextText}`,
      });
    }

    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.chatTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.chatModel,
          messages,
          stream: false,
          ...ollamaResponseFormat(options),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama chat gagal: HTTP ${response.status} — ${body}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };

    const content = data.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Ollama chat mengembalikan respons tidak terduga: message.content tidak ada');
    }

    return content;
  }
}

function ollamaResponseFormat(options?: AiChatOptions): Record<string, unknown> {
  const responseFormat = options?.responseFormat;
  if (!responseFormat) return {};
  const generationOptions = {
    temperature: 0.2,
    num_predict: 512,
  };
  if (responseFormat === 'json_object') {
    return { format: 'json', options: generationOptions };
  }
  return { format: responseFormat.schema, options: generationOptions };
}
