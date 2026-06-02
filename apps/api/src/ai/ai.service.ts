// =============================================================================
// AiService — Embed, RAG search, chat, knowledge management
//
// Kolom vector(768) adalah Unsupported di Prisma — semua INSERT/UPDATE embedding
// wajib via $executeRaw, SELECT via $queryRaw (::vector cast).
//
// Alur knowledge:
//   create  → isActive=false (draft), embed fail-soft
//   PATCH   → jika content berubah: re-embed + isActive=false kembali draft
//   publish → SA/KS; cek embedding IS NOT NULL (422 jika NULL); isActive=true
//   unpublish → SA/KS; isActive=false
//   delete  → SA; hard-delete
// =============================================================================

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIGateway, RagContext } from '@smk/types';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
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
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface KnowledgeDetailRaw extends KnowledgeListItemRaw {
  content: string;
  source: string;
  updatedAt: Date;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SA_KS = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as const;

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AI_GATEWAY') private readonly gateway: AIGateway,
  ) {}

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** keycloakId → auth.users.id (UUID) */
  private async resolveUserId(keycloakId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('User tidak ditemukan');
    return user.id;
  }

  private canPublish(user: AuthUser): boolean {
    return user.roles.some((r) => (SA_KS as readonly string[]).includes(r));
  }

  // ── Chatbot RAG ─────────────────────────────────────────────────────────────

  /**
   * Cari chunk paling mirip berdasarkan cosine similarity.
   * Hanya chunk is_active=true (published) yang dipakai.
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
   * Graceful empty: retrieval kosong → chat tanpa context, tidak 500.
   *
   * TODO (Sprint 4 SMA-48): persist sessionId ke ChatSession/ChatMessage.
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
      chunks.length > 0
        ? chunks.map((c) => ({ title: c.title, content: c.content }))
        : undefined;

    const answer = await this.gateway.chat(dto.message, context);

    return {
      answer,
      sources: chunks.map((c) => ({ title: c.title })),
      sessionId: dto.sessionId,
    };
  }

  // ── Knowledge CRUD ──────────────────────────────────────────────────────────

  /**
   * Buat knowledge chunk sebagai DRAFT (isActive=false).
   * createdBy = auth.users.id. Embed fail-soft.
   */
  async createKnowledge(
    dto: CreateKnowledgeDto,
    user: AuthUser,
  ): Promise<{
    id: string;
    title: string;
    category: string;
    source: string;
    isActive: boolean;
    createdBy: string | null;
    createdAt: Date;
    embeddingOk: boolean;
  }> {
    const createdBy = await this.resolveUserId(user.keycloakId);

    const chunk = await this.prisma.ragChunk.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category,
        source: dto.source ?? 'manual',
        isActive: false, // draft — wajib publish setelah embed
        createdBy,
      },
      select: {
        id: true,
        title: true,
        category: true,
        source: true,
        isActive: true,
        createdBy: true,
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
   * List semua knowledge chunk (termasuk draft + unpublished) untuk manajemen.
   * Chatbot hanya mengambil is_active=true via searchSimilar — tidak terganggu.
   */
  async listKnowledge(): Promise<KnowledgeListItemRaw[]> {
    return this.prisma.$queryRaw<KnowledgeListItemRaw[]>(Prisma.sql`
      SELECT
        id::text,
        title,
        category,
        is_active      AS "isActive",
        (embedding IS NOT NULL) AS "hasEmbedding",
        created_by::text   AS "createdBy",
        published_by::text AS "publishedBy",
        published_at   AS "publishedAt",
        created_at     AS "createdAt"
      FROM ai_knowledge.rag_chunks
      ORDER BY created_at DESC
      LIMIT 200
    `);
  }

  /**
   * Detail satu chunk termasuk content + audit.
   */
  async getKnowledgeById(id: string): Promise<KnowledgeDetailRaw> {
    const rows = await this.prisma.$queryRaw<KnowledgeDetailRaw[]>(Prisma.sql`
      SELECT
        id::text,
        title,
        content,
        source,
        category,
        is_active      AS "isActive",
        (embedding IS NOT NULL) AS "hasEmbedding",
        created_by::text   AS "createdBy",
        published_by::text AS "publishedBy",
        published_at   AS "publishedAt",
        created_at     AS "createdAt",
        updated_at     AS "updatedAt"
      FROM ai_knowledge.rag_chunks
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException(`RagChunk ${id} tidak ditemukan`);
    return row;
  }

  /**
   * Edit chunk. Jika content berubah → re-embed (fail-soft) + isActive=false (kembali draft).
   * Jika hanya title/category → update tanpa re-embed, status tidak berubah.
   */
  async updateKnowledge(id: string, dto: UpdateKnowledgeDto): Promise<KnowledgeDetailRaw> {
    const existing = await this.prisma.ragChunk.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) throw new NotFoundException(`RagChunk ${id} tidak ditemukan`);

    const contentChanged = dto.content !== undefined;

    await this.prisma.ragChunk.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(contentChanged ? { isActive: false } : {}),
      },
    });

    if (contentChanged && dto.content) {
      try {
        const vector = await this.gateway.embed(dto.content);
        const vectorStr = `[${vector.join(',')}]`;
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE ai_knowledge.rag_chunks
          SET embedding = ${vectorStr}::vector
          WHERE id = ${id}::uuid
        `);
        logger.info(`[AiService] Re-embed chunk ${id} berhasil`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`[AiService] Re-embed gagal — chunk kembali draft, embedding stale`, {
          chunkId: id,
          error: message,
        });
      }
    }

    return this.getKnowledgeById(id);
  }

  /**
   * Publish chunk: isActive=true. SA/KS only.
   * Gate: embedding HARUS ada — 422 jika NULL.
   */
  async publishKnowledge(id: string, user: AuthUser): Promise<{ id: string; isActive: boolean; publishedAt: Date | null }> {
    if (!this.canPublish(user)) {
      throw new ForbiddenException('Akses ditolak: hanya SA/KS yang bisa publish');
    }

    const rows = await this.prisma.$queryRaw<Array<{ id: string; hasEmbedding: boolean }>>(Prisma.sql`
      SELECT id::text, (embedding IS NOT NULL) AS "hasEmbedding"
      FROM ai_knowledge.rag_chunks
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const chunk = rows[0];
    if (!chunk) throw new NotFoundException(`RagChunk ${id} tidak ditemukan`);
    if (!chunk.hasEmbedding) {
      throw new UnprocessableEntityException(
        'Chunk tidak bisa dipublish: embedding NULL. Jalankan backfill atau re-embed terlebih dahulu.',
      );
    }

    const publishedBy = await this.resolveUserId(user.keycloakId);
    const now = new Date();

    await this.prisma.ragChunk.update({
      where: { id },
      data: { isActive: true, publishedBy, publishedAt: now },
    });

    return { id, isActive: true, publishedAt: now };
  }

  /**
   * Unpublish chunk: isActive=false. SA/KS only.
   */
  async unpublishKnowledge(id: string, user: AuthUser): Promise<{ id: string; isActive: boolean }> {
    if (!this.canPublish(user)) {
      throw new ForbiddenException('Akses ditolak: hanya SA/KS yang bisa unpublish');
    }
    const existing = await this.prisma.ragChunk.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`RagChunk ${id} tidak ditemukan`);

    await this.prisma.ragChunk.update({
      where: { id },
      data: { isActive: false },
    });
    return { id, isActive: false };
  }

  /**
   * Hard-delete chunk. SA only (dikontrol di controller via @Roles).
   * Keputusan: hard-delete (bukan soft) karena tidak ada kolom deletedAt dalam scope.
   * Soft-delete tidak bisa dibedakan dari unpublish tanpa kolom tambahan.
   */
  async deleteKnowledge(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.ragChunk.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`RagChunk ${id} tidak ditemukan`);

    await this.prisma.ragChunk.delete({ where: { id } });
    return { id };
  }

  // ── Backfill ────────────────────────────────────────────────────────────────

  /**
   * Backfill embedding untuk semua RagChunk yang embedding IS NULL.
   * N-13: pengganti script ts-node db:embed-faq di image prod.
   * Idempoten — chunk yang sudah ada embedding di-skip.
   */
  async backfillEmbeddings(): Promise<EmbedChunkResult[]> {
    const chunks = await this.prisma.$queryRaw<Array<{ id: string; content: string }>>(Prisma.sql`
      SELECT id::text, content
      FROM ai_knowledge.rag_chunks
      WHERE embedding IS NULL
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
