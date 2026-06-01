/* eslint-disable no-console */
// =============================================================================
// embed-faq.ts — Script standalone: backfill embedding RagChunk
//
// Dijalankan di VPS (tempat Ollama tersedia):
//   cd apps/api && npm run db:embed-faq
//
// Prasyarat:
//   1. Ollama berjalan dan model sudah di-pull:
//      docker exec ollama ollama pull nomic-embed-text
//   2. DATABASE_URL tersedia di env (PostgreSQL dengan pgvector)
//   3. OLLAMA_URL, OLLAMA_EMBED_MODEL, OLLAMA_EMBED_DIMENSIONS sesuai env
//
// Script ini TIDAK memerlukan NestJS bootstrap penuh — inisialisasi minimal
// PrismaClient + OllamaAdapter langsung.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { OllamaAdapter } from '../adapters/ollama.adapter';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const baseUrl = process.env['OLLAMA_URL'] ?? 'http://ollama:11434';
  const chatModel = process.env['OLLAMA_CHAT_MODEL'] ?? 'qwen2.5:7b';
  const embedModel = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';
  const embedDimensions = parseInt(process.env['OLLAMA_EMBED_DIMENSIONS'] ?? '768', 10);

  const adapter = new OllamaAdapter(baseUrl, chatModel, embedModel, embedDimensions);

  console.log(`🔧 Embed FAQ — model: ${embedModel}, dimensi: ${embedDimensions}`);
  console.log(`   Ollama URL: ${baseUrl}`);

  try {
    const chunks = await prisma.$queryRaw<Array<{ id: string; content: string; title: string }>>(
      Prisma.sql`
        SELECT id::text, title, content
        FROM ai_knowledge.rag_chunks
        WHERE embedding IS NULL
          AND is_active = true
        ORDER BY created_at ASC
      `,
    );

    console.log(`📦 Ditemukan ${chunks.length} chunk tanpa embedding\n`);

    if (chunks.length === 0) {
      console.log('✅ Semua chunk sudah memiliki embedding. Tidak ada yang perlu di-backfill.');
      return;
    }

    let ok = 0;
    let fail = 0;

    for (const chunk of chunks) {
      process.stdout.write(`  Embed "${chunk.title}" (${chunk.id.slice(0, 8)}...)... `);
      try {
        const vector = await adapter.embed(chunk.content);
        const vectorStr = `[${vector.join(',')}]`;

        await prisma.$executeRaw(Prisma.sql`
          UPDATE ai_knowledge.rag_chunks
          SET embedding = ${vectorStr}::vector
          WHERE id = ${chunk.id}::uuid
        `);

        console.log(`✅ (${vector.length}d)`);
        ok++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`❌ GAGAL: ${message}`);
        fail++;
      }
    }

    console.log(`\n📊 Backfill selesai: ${ok} berhasil, ${fail} gagal`);

    if (fail > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
