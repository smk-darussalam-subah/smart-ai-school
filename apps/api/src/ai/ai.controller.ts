// =============================================================================
// AiController — /api/v1/ai
//
// POST   /ai/chat                     — semua authenticated
// GET    /ai/knowledge                — SA, KS, TU
// POST   /ai/knowledge                — SA, KS, TU (create → draft)
// GET    /ai/knowledge/:id            — SA, KS, TU
// PATCH  /ai/knowledge/:id            — SA, KS, TU (re-embed + draft jika content berubah)
// POST   /ai/knowledge/:id/publish    — SA, KS (separation of duties: TU tidak bisa self-publish)
// POST   /ai/knowledge/:id/unpublish  — SA, KS
// DELETE /ai/knowledge/:id            — SA only
// POST   /ai/knowledge/backfill       — SA (N-13: pengganti script ts-node)
// =============================================================================

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { ChatSchema, ChatDto } from './dto/chat.dto';
import { CreateKnowledgeSchema, CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeSchema, UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AuthUser } from '@smk/auth';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ── Chatbot ─────────────────────────────────────────────────────────────────

  /**
   * POST /ai/chat — RAG chatbot, semua authenticated.
   * Throttle ketat: setiap request → Ollama embed + chat.
   * SMA-49: pesan user + jawaban assistant disimpan ke ChatSession/ChatMessage.
   * Tanpa sessionId → buat session baru; sessionId selalu dikembalikan.
   */
  @RequirePermission('ai.chat')
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ aichat: { ttl: 60_000, limit: 20 } })
  chat(
    @Body(ZodPipe(ChatSchema)) dto: ChatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.chatWithRag(dto, user);
  }

  /**
   * GET /ai/chat/:sessionId/history — riwayat pesan satu session.
   * RBAC (service-level): pemilik session ATAU SUPER_ADMIN.
   * Non-pemilik → 403; session tak ada → 404.
   */
  @RequirePermission('ai.chat')
  @Get('chat/:sessionId/history')
  @HttpCode(HttpStatus.OK)
  history(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.getChatHistory(sessionId, user);
  }

  // ── Knowledge — collection ──────────────────────────────────────────────────

  /**
   * GET /ai/knowledge — List semua chunk (draft + published) untuk manajemen.
   * SA/KS/TU: admin content. Chatbot hanya baca is_active=true via searchSimilar.
   */
  @Get('knowledge')
  @RequirePermission('ai.knowledge.read')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  listKnowledge() {
    return this.aiService.listKnowledge();
  }

  /**
   * POST /ai/knowledge — Buat chunk baru sebagai DRAFT (isActive=false).
   * SA/KS/TU bisa create, tapi publish butuh SA/KS (separation of duties).
   */
  @Post('knowledge')
  @RequirePermission('ai.knowledge.create')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @HttpCode(HttpStatus.CREATED)
  createKnowledge(
    @Body(ZodPipe(CreateKnowledgeSchema)) dto: CreateKnowledgeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.createKnowledge(dto, user);
  }

  /**
   * POST /ai/knowledge/backfill — Embed semua chunk NULL.
   * HARUS didefinisikan sebelum :id routes agar 'backfill' tidak diparse sebagai :id.
   */
  @Post('knowledge/backfill')
  @RequirePermission('ai.knowledge.create')
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

  // ── Knowledge — item ────────────────────────────────────────────────────────

  /**
   * GET /ai/knowledge/:id — Detail chunk termasuk content + audit trail.
   */
  @Get('knowledge/:id')
  @RequirePermission('ai.knowledge.read')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  getKnowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiService.getKnowledgeById(id);
  }

  /**
   * PATCH /ai/knowledge/:id — Edit title/content/category.
   * Jika content berubah → re-embed (fail-soft) + kembali draft.
   * Jika hanya title/category → status tidak berubah.
   */
  @Patch('knowledge/:id')
  @RequirePermission('ai.knowledge.update')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  updateKnowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateKnowledgeSchema)) dto: UpdateKnowledgeDto,
  ) {
    return this.aiService.updateKnowledge(id, dto);
  }

  /**
   * POST /ai/knowledge/:id/publish — Set isActive=true.
   * Gate: embedding HARUS ada (422 jika NULL). SA/KS only.
   */
  @Post('knowledge/:id/publish')
  @RequirePermission('ai.knowledge.update')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @HttpCode(HttpStatus.OK)
  publishKnowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.publishKnowledge(id, user);
  }

  /**
   * POST /ai/knowledge/:id/unpublish — Set isActive=false. SA/KS only.
   */
  @Post('knowledge/:id/unpublish')
  @RequirePermission('ai.knowledge.update')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @HttpCode(HttpStatus.OK)
  unpublishKnowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiService.unpublishKnowledge(id, user);
  }

  /**
   * DELETE /ai/knowledge/:id — Hard-delete. SA only.
   * Keputusan: hard-delete karena tidak ada kolom deletedAt (out of scope).
   */
  @Delete('knowledge/:id')
  @RequirePermission('ai.knowledge.delete')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  deleteKnowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiService.deleteKnowledge(id);
  }
}
