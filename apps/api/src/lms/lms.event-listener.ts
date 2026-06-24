// =============================================================================
// LmsEventListener — W2-10: RPP→LMS hook.
// Mendengarkan EVENTS.RPP_REVIEWED. Saat RPP disetujui (decision='approved'),
// auto-create draft LMS module pre-filled dengan metadata dari RPP.
// Idempoten: cek apakah LMS module dengan rppId sudah ada sebelum membuat.
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS, RppReviewedPayload } from '../events/events.types';

@Injectable()
export class LmsEventListener {
  private readonly logger = new Logger(LmsEventListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(EVENTS.RPP_REVIEWED)
  async handleRppReviewed(payload: RppReviewedPayload) {
    if (payload.decision !== 'approved') return;

    try {
      // Idempotency: jangan buat duplikat LMS module untuk RPP yang sama
      const existing = await this.prisma.lmsModule.findFirst({
        where: { rppId: payload.rppId },
        select: { id: true },
      });
      if (existing) {
        this.logger.debug(`LMS module for RPP ${payload.rppId} already exists — skip`);
        return;
      }

      // Baca RPP untuk metadata lengkap
      const rpp = await this.prisma.rpp.findUnique({
        where: { id: payload.rppId },
        select: {
          id: true, teacherId: true, classId: true, subject: true, title: true,
          body: true, academicYear: true, semester: true,
        },
      });
      if (!rpp) {
        this.logger.warn(`RPP ${payload.rppId} not found — cannot create LMS module`);
        return;
      }

      // Extract metadata dari RPP body (JSONB — Modul Ajar terstruktur)
      const body = (rpp.body ?? {}) as Record<string, unknown>;
      const jpAllocation = typeof body['jpAllocation'] === 'number' ? body['jpAllocation'] as number : null;
      const kktp = typeof body['kktp'] === 'number' ? body['kktp'] as number : 75; // default KKM
      const tpArray = Array.isArray(body['tp']) ? body['tp'] as string[] : [];
      const tp = tpArray.length > 0 ? tpArray[0]!.slice(0, 50) : null;

      const lmsModule = await this.prisma.lmsModule.create({
        data: {
          teacherId: rpp.teacherId,
          rppId: rpp.id,
          classId: rpp.classId,
          subject: rpp.subject,
          title: rpp.title,
          tp: tp,
          jpAllocation: jpAllocation,
          kktp: kktp,
          content: rpp.body ? JSON.stringify(rpp.body) : null,
          orderIndex: 0,
          status: 'draft', // guru publish saat siap
          academicYear: rpp.academicYear,
          semester: rpp.semester,
        },
        select: { id: true, title: true, subject: true },
      });

      this.logger.log(`Auto-created draft LMS module "${lmsModule.title}" (${lmsModule.id}) from approved RPP ${payload.rppId}`);
    } catch (err) {
      // Fail-soft: jangan block review pipeline jika LMS creation gagal
      this.logger.error(`Failed to auto-create LMS module from RPP ${payload.rppId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
