// =============================================================================
// AiService — Layanan AI untuk embed + backfill chunk
//
// backfillEmbeddings(): embed semua RagChunk yang embedding IS NULL & isActive.
// Tulis embedding via $queryRaw (kolom vector(768) = Unsupported, tak bisa
// via Prisma biasa — SMA-44 comment).
//
// Format pgvector: '[a,b,c,...]'::vector — string literal array float.
// =============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { AIGateway } from '@smk/types';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface EmbedChunkResult {
  id: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
  ) {}

  /**
   * Backfill embedding untuk semua RagChunk yang embedding IS NULL.
   * Chunk yang sudah ada embedding → di-skip (idempoten).
   * Dijalankan via `npm run db:embed-faq` di VPS (tempat Ollama tersedia).
   */
  async backfillEmbeddings(): Promise<EmbedChunkResult[]> {
    // Ambil chunk aktif yang belum punya embedding
    const chunks = await this.prisma.$queryRaw<
      Array<{ id: string; content: string }>
    >(Prisma.sql`
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
        // Format pgvector: '[0.1,0.2,...]'
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
