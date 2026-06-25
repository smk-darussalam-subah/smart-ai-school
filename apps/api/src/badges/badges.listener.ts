// =============================================================================
// BadgesListener — auto-award badges via event listeners (P14 — W3-1).
//
// Guardrail (§17.5 #25):
//   • All listeners are fail-soft — try/catch with logger.warn, never throw.
//   • Idempotency — BadgesService.tryAwardBadge() checks existing StudentBadge
//     before creating, preventing duplicates on event replay.
//   • Primary action (grade submission, attendance recording) is NEVER blocked
//     by badge award failure.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logger } from '@smk/logger';
import {
  EVENTS,
  GradeSubmittedPayload,
  AttendanceRecordedPayload,
} from '../events/events.types';
import { BadgesService } from './badges.service';

@Injectable()
export class BadgesListener {
  constructor(private readonly badgesService: BadgesService) {}

  /**
   * grade.submitted → check grade_threshold badges.
   * If score >= badge criteria threshold, award badge automatically.
   * Fail-soft: errors logged, grade submission is never blocked.
   */
  @OnEvent(EVENTS.GRADE_SUBMITTED)
  async handleGradeSubmitted(payload: GradeSubmittedPayload): Promise<void> {
    try {
      const score = Number(payload.score);
      if (Number.isNaN(score)) {
        logger.warn('[BadgesListener] grade.submitted: score is NaN', {
          gradeId: payload.gradeId,
          score: payload.score,
        });
        return;
      }
      await this.badgesService.checkGradeBadges(
        payload.studentId,
        payload.subject,
        score,
      );
    } catch (err) {
      logger.warn('[BadgesListener] grade.submitted error (fail-soft)', {
        gradeId: payload.gradeId,
        studentId: payload.studentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * attendance.recorded → placeholder for attendance_streak badge criteria.
   * Currently only fires for alpha/sakit status. Perfect-attendance badges
   * would require a scheduled job or a different event.
   * Future enhancement: add a daily cron job to check attendance streaks.
   */
  @OnEvent(EVENTS.ATTENDANCE_RECORDED)
  async handleAttendanceRecorded(payload: AttendanceRecordedPayload): Promise<void> {
    try {
      // Currently no attendance_streak badges can be auto-awarded from this event
      // because it only fires for alpha/sakit (not for "hadir").
      // Perfect-attendance badge requires counting consecutive "hadir" days,
      // which needs a scheduled job. Left as TODO for future enhancement.
      logger.debug('[BadgesListener] attendance.recorded received (no auto-award yet)', {
        attendanceId: payload.attendanceId,
        status: payload.status,
      });
    } catch (err) {
      logger.warn('[BadgesListener] attendance.recorded error (fail-soft)', {
        attendanceId: payload.attendanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
