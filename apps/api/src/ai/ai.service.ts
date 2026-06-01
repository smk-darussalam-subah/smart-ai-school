// =============================================================================
// AiService — Embed, RAG search, chat, knowledge management
//
// Kolom vector(768) adalah Unsupported di Prisma — semua INSERT/UPDATE embedding
// wajib via $executeRaw, SELECT via $queryRaw (::vector cast). Pola ini konsisten
// dengan SMA-44 dan SMA-45.
// =============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { AIGateway, RagContext } from '@smk/types';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { ChatDto } from './dto/chat.dto';

export interface EmbedChunkResult {
  id: string;
  success: boolean;
  error?: string;
}

interface SimilarChunkRaw {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

export interface KnowledgeListItemRaw {
  id: string;
  title: string;
  category: string;
  isActive: boolean;
  hasEmbedding: boolean;
  createdAt: Date;
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
  ) {}

  /**
   * Cari chunk paling mirip berdasarkan cosine similarity.
   * Menggunakan index hnsw vector_cosine_ops (operator <=>).
   * Parameterized via Prisma.sql — tidak ada string concat (injection safe).
   */
  async searchSimilar(
    vector: number[],
    topK: number,
    minSimilarity: number,
  ): Promise<SimilarChunkRaw[]> {
    const vectorStr = `[${vector.join(',')}]`;
    const results = await this.prisma.$queryRaw<SimilarChunkRaw[]>(Prisma.sql`
      SELECT
        id::text,
        title,
        content,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM ai_knowledge.rag_chunks
      WHERE is_active = true AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `);
    return results.filter((r) => Number(r.similarity) >= minSimilarity);
  }

  /**
   * Endpoint chatbot RAG utama.
   * Alur: embed → vector search → chat(context) → {answer, sources, sessionId}.
   * Graceful empty: bila tidak ada chunk ber-embedding → balas tanpa context (tidak 500).
   *
   * TODO (Sprint 4 SMA-48): persist sessionId ke ChatSession/ChatMessage
   * untuk history GET /ai/chat/:sessionId/history.
   */
  async chatWithRag(dto: ChatDto): Promise<{
    answer: string;
    sources: { title: string }[];
    sessionId: string | undefined;
  }> {
    const topK = parseInt(process.env['AI_RAG_TOP_K'] ?? '4', 10);
    const minSimilarity = parseFloat(process.env['AI_RAG_MIN_SIMILARITY'] ?? '0.3');

    const vector = await this.gateway.embed(dto.message);
    const chunks = await this.searchSimilar(vector, topK, minSimilarity);

    const context: RagContext[] | undefined =
      chunks.length > 0 ? chunks.map((c) => ({ title: c.title, content: c.content })) : undefined;

    const answer = await this.gateway.chat(dto.message, context);

    return {
      answer,
      sources: chunks.map((c) => ({ title: c.title })),
      sessionId: dto.sessionId,
    };
  }

  /**
   * Buat knowledge chunk baru dan langsung embed kontennya.
   * Fail-soft: jika Ollama tidak tersedia → chunk tersimpan, embedding NULL (bisa di-backfill nanti).
   */
  async createKnowledge(dto: CreateKnowledgeDto): Promise<{
    id: string;
    title: string;
    category: string;
    source: string;
    isActive: boolean;
    createdAt: Date;
    embeddingOk: boolean;
  }> {
    const chunk = await this.prisma.ragChunk.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category,
        source: dto.source ?? 'manual',
      },
      select: {
        id: true,
        title: true,
        category: true,
        source: true,
        isActive: true,
        createdAt: true,
      },
    });

    let embeddingOk = false;
    try {
      const vector = await this.gateway.embed(dto.content);
      const vectorStr = `[${vector.join(',')}]`;
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE ai_knowledge.rag_chunks
        SET embedding = ${vectorStr}::vector
        WHERE id = ${chunk.id}::uuid
      `);
      embeddingOk = true;
      logger.info(`[AiService] Chunk ${chunk.id} di-embed berhasil`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[AiService] Embed gagal saat createKnowledge — chunk tersimpan, embedding NULL`, {
        chunkId: chunk.id,
        error: message,
      });
    }

    return { ...chunk, embeddingOk };
  }

  /**
   * List knowledge chunk dengan flag hasEmbedding.
   * Menggunakan $queryRaw karena embedding (Unsupported) tidak bisa di-select via Prisma biasa.
   */
  async listKnowledge(): Promise<KnowledgeListItemRaw[]> {
    return this.prisma.$queryRaw<KnowledgeListItemRaw[]>(Prisma.sql`
      SELECT
        id::text,
        title,
        category,
        is_active AS "isActive",
        (embedding IS NOT NULL) AS "hasEmbedding",
        created_at AS "createdAt"
      FROM ai_knowledge.rag_chunks
      ORDER BY created_at DESC
      LIMIT 200
    `);
  }

  /**
   * Backfill embedding untuk semua RagChunk yang embedding IS NULL.
   * Chunk yang sudah ada embedding → di-skip (idempoten).
   * Dijalankan via endpoint POST /ai/knowledge/backfill (pengganti script ts-node N-13).
   */
  async backfillEmbeddings(): Promise<EmbedChunkResult[]> {
    const chunks = await this.prisma.$queryRaw<Array<{ id: string; content: string }>>(Prisma.sql`
      SELECT id::text, content
      FROM ai_knowledge.rag_chunks
      WHERE embedding IS NULL
        AND is_active = true
      ORDER BY created_at ASC
    `);

    logger.info(`[AiService] Backfill: ${chunks.length} chunk tanpa embedding`, {
      count: chunks.length,
    });

    const results: EmbedChunkResult[] = [];

    for (const chunk of chunks) {
      try {
        const vector = await this.gateway.embed(chunk.content);
        const vectorStr = `[${vector.join(',')}]`;

        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE ai_knowledge.rag_chunks
          SET embedding = ${vectorStr}::vector
          WHERE id = ${chunk.id}::uuid
        `);

        logger.info(`[AiService] Berhasil embed chunk ${chunk.id}`);
        results.push({ id: chunk.id, success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[AiService] Gagal embed chunk ${chunk.id}`, { error: message });
        results.push({ id: chunk.id, success: false, error: message });
      }
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    logger.info(`[AiService] Backfill selesai: ${ok} berhasil, ${fail} gagal`);

    return results;
  }
}
