// =============================================================================
// AiModule — Provider AI_GATEWAY dipilih via env AI_PROVIDER:
//   ollama  → OllamaAdapter (default)
//   claude  → belum diimplementasikan (Sprint 4 SMA-48) — throw
//
// Pola identik NotificationModule (useFactory buildAdapter).
// Ekspor AI_GATEWAY agar bisa dipakai RagModule / SMA-46.
// =============================================================================

import { Module } from '@nestjs/common';
import { AIGateway } from '@smk/types';
import { OllamaAdapter } from './adapters/ollama.adapter';
import { AiService } from './ai.service';
import { PrismaModule } from '../prisma/prisma.module';

function buildAiGateway(): AIGateway {
  const provider = process.env['AI_PROVIDER'] ?? 'ollama';

  if (provider === 'claude') {
    throw new Error(
      'AI_PROVIDER=claude belum diimplementasikan — tersedia Sprint 4 (SMA-48). ' +
        'Gunakan AI_PROVIDER=ollama.',
    );
  }

  // Default: ollama
  const baseUrl = process.env['OLLAMA_URL'] ?? 'http://ollama:11434';
  const chatModel = process.env['OLLAMA_CHAT_MODEL'] ?? 'qwen2.5:7b';
  const embedModel = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';
  const embedDimensions = parseInt(process.env['OLLAMA_EMBED_DIMENSIONS'] ?? '768', 10);

  return new OllamaAdapter(baseUrl, chatModel, embedModel, embedDimensions);
}

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: 'AI_GATEWAY',
      useFactory: buildAiGateway,
    },
    AiService,
  ],
  exports: ['AI_GATEWAY', AiService],
})
export class AiModule {}
