// =============================================================================
// AiModule — Provider AI_GATEWAY (Ollama, selalu) + CLAUDE_GATEWAY (legacy) + OPENAI_GATEWAY (R-28)
//
// AI_GATEWAY    = OllamaAdapter — selalu aktif; dipakai untuk embed() + chat fallback.
// OPENAI_GATEWAY = OpenAiAdapter | null — aktif hanya jika:
//   AI_PROVIDER=openai DAN OPENAI_API_KEY tersedia.
//   R-28: Hybrid strategy — Ollama (embed only) + OpenAI gpt-4.1-mini (chat/generate).
// CLAUDE_GATEWAY = ClaudeAdapter | null — legacy; aktif hanya jika:
//   AI_PROVIDER=claude DAN ANTHROPIC_API_KEY tersedia.
//   Tanpa key → null → service fallback ke Ollama.
//
// Decision tree PII (R-03) ada di AiService.chatWithRag(), bukan di sini.
// Pola identik NotificationModule (useFactory buildAdapter).
// =============================================================================

import { Module } from '@nestjs/common';
import { AIGateway } from '@smk/types';
import { OllamaAdapter } from './adapters/ollama.adapter';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiGenerateService } from './ai-generate.service';
import { AiGenerateController } from './ai-generate.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';

function buildAiGateway(): AIGateway {
  const baseUrl = process.env['OLLAMA_URL'] ?? 'http://ollama:11434';
  const chatModel = process.env['OLLAMA_CHAT_MODEL'] ?? 'qwen2.5:7b';
  const embedModel = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';
  const embedDimensions = parseInt(process.env['OLLAMA_EMBED_DIMENSIONS'] ?? '768', 10);

  return new OllamaAdapter(baseUrl, chatModel, embedModel, embedDimensions);
}

/** Kembalikan ClaudeAdapter jika AI_PROVIDER=claude + ANTHROPIC_API_KEY tersedia; null jika tidak. */
function buildClaudeGateway(): AIGateway | null {
  const provider = process.env['AI_PROVIDER'] ?? 'ollama';
  const apiKey = process.env['ANTHROPIC_API_KEY'];

  if (provider !== 'claude' || !apiKey) return null;

  return new ClaudeAdapter(apiKey);
}

/** R-28: Kembalikan OpenAiAdapter jika AI_PROVIDER=openai + OPENAI_API_KEY tersedia; null jika tidak. */
function buildOpenAiGateway(): AIGateway | null {
  const provider = process.env['AI_PROVIDER'] ?? 'ollama';
  const apiKey = process.env['OPENAI_API_KEY'];

  if (provider !== 'openai' || !apiKey) return null;

  const model = process.env['OPENAI_CHAT_MODEL'] ?? 'gpt-4.1-mini';
  return new OpenAiAdapter(apiKey, model);
}

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [AiController, AiGenerateController],
  providers: [
    {
      provide: 'AI_GATEWAY',
      useFactory: buildAiGateway,
    },
    {
      provide: 'CLAUDE_GATEWAY',
      useFactory: buildClaudeGateway,
    },
    {
      provide: 'OPENAI_GATEWAY',
      useFactory: buildOpenAiGateway,
    },
    AiService,
    AiGenerateService,
  ],
  exports: ['AI_GATEWAY', 'CLAUDE_GATEWAY', 'OPENAI_GATEWAY', AiService, AiGenerateService],
})
export class AiModule {}
