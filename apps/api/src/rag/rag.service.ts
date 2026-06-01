// =============================================================================
// RagService — CRUD non-vector untuk RagChunk (SMA-44)
//
// Pencarian vektor (cosine similarity) via $queryRaw ditunda ke SMA-45/46
// karena membutuhkan OllamaAdapter.embed() yang belum ada.
// embedding adalah Unsupported("vector(768)") — tidak bisa di-where/select biasa;
// insert/update embedding HARUS via $queryRaw (SMA-45).
// =============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateRagChunkDto {
  title: string;
  content: string;
  source: string;
  category: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ListRagChunksQuery {
  category?: string;
  isActive?: boolean;
  take?: number;
  skip?: number;
}

@Injectable()
export class RagService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRagChunkDto) {
    return this.prisma.ragChunk.create({
      data: {
        title: dto.title,
        content: dto.content,
        source: dto.source,
        category: dto.category,
        metadata: dto.metadata,
      },
      select: {
        id: true,
        title: true,
        source: true,
        category: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async list(query: ListRagChunksQuery = {}) {
    const { category, isActive = true, take = 20, skip = 0 } = query;
    return this.prisma.ragChunk.findMany({
      where: {
        ...(category !== undefined ? { category } : {}),
        isActive,
      },
      select: {
        id: true,
        title: true,
        content: true,
        source: true,
        category: true,
        metadata: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async deactivate(id: string) {
    return this.prisma.ragChunk.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  // TODO (SMA-45): vector similarity search via $queryRaw
  // Signature reservasi untuk OllamaAdapter.embed() integration:
  //
  // async searchSimilar(
  //   query: string,
  //   opts: { category?: string; limit?: number },
  // ): Promise<Array<{ id: string; title: string; content: string; score: number }>> {
  //   const embedding = await this.ollamaAdapter.embed(query);
  //   return this.prisma.$queryRaw`
  //     SELECT id, title, content,
  //            1 - (embedding <=> ${embedding}::vector) AS score
  //     FROM ai_knowledge.rag_chunks
  //     WHERE is_active = true
  //       ${opts.category ? Prisma.sql`AND category = ${opts.category}` : Prisma.sql``}
  //     ORDER BY embedding <=> ${embedding}::vector
  //     LIMIT ${opts.limit ?? 5}
  //   `;
  // }
}
