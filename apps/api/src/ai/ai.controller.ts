// =============================================================================
// AiController — /api/v1/ai
//
// POST /ai/chat        — semua authenticated (tanpa @Roles = any auth user)
// GET  /ai/knowledge   — SA only
// POST /ai/knowledge   — SA only
// POST /ai/knowledge/backfill — SA only (N-13: pengganti script ts-node di prod)
// =============================================================================

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { ChatSchema, ChatDto } from './dto/chat.dto';
import { CreateKnowledgeSchema, CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /ai/chat — Chatbot RAG untuk semua user authenticated.
   * Rate limit ketat (20 req/menit) karena setiap request memanggil Ollama.
   * sessionId di-echo tapi tidak di-persist (history = Sprint 4 SMA-48).
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ aichat: { ttl: 60_000, limit: 20 } })
  chat(@Body(ZodPipe(ChatSchema)) dto: ChatDto) {
    return this.aiService.chatWithRag(dto);
  }

  /**
   * GET /ai/knowledge — List semua knowledge chunk + flag hasEmbedding.
   * SA only: manajemen konten internal.
   */
  @Get('knowledge')
  @Roles('SUPER_ADMIN')
  listKnowledge() {
    return this.aiService.listKnowledge();
  }

  /**
   * POST /ai/knowledge — Buat chunk baru + langsung embed.
   * Fail-soft: jika Ollama down → chunk tersimpan, embeddingOk=false, bisa di-backfill via /backfill.
   */
  @Post('knowledge')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  createKnowledge(@Body(ZodPipe(CreateKnowledgeSchema)) dto: CreateKnowledgeDto) {
    return this.aiService.createKnowledge(dto);
  }

  /**
   * POST /ai/knowledge/backfill — Backfill embedding semua chunk NULL.
   * N-13: pengganti script ts-node db:embed-faq yang tidak bisa jalan di image prod.
   * Idempoten — chunk yang sudah ada embedding di-skip.
   */
  @Post('knowledge/backfill')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  async backfill() {
    const results = await this.aiService.backfillEmbeddings();
    return {
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }
}
