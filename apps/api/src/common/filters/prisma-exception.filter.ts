// =============================================================================
// PrismaExceptionFilter — Peta Prisma error codes ke HTTP status yang tepat.
//
// Diterapkan GLOBAL (main.ts) — menutup kelas bug yang sama di semua modul
// tanpa try/catch per-service.
//
// Peta:
//   P2002 → 409 Conflict      (unique constraint violated)
//   P2003 → 409 Conflict      (FK restrict — ada data terkait, tidak bisa hapus)
//   P2025 → 404 Not Found     (record tidak ditemukan saat update/delete)
//   lainnya → 500 + log
// =============================================================================

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { captureException } from '@sentry/nestjs';
import { logError } from '@smk/logger';

const PRISMA_HTTP_MAP: Record<string, { status: number; error: string; message: string }> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'Data duplikat: kombinasi yang sama sudah ada',
  },
  P2003: {
    status: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'Tidak bisa dihapus: ada data terkait yang bergantung pada record ini',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    error: 'Not Found',
    message: 'Record tidak ditemukan',
  },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const mapped = PRISMA_HTTP_MAP[exception.code];

    if (mapped) {
      reply.status(mapped.status).send({
        statusCode: mapped.status,
        message: mapped.message,
        error: mapped.error,
        prismaCode: exception.code,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    // Prisma error yang tidak dikenal → 500 + log + capture ke Sentry
    // P2002/P2003/P2025 (4xx) sudah ditangani di atas, tidak capture.
    logError('Unhandled Prisma error', exception, {
      code: exception.code,
      path: request.url,
    });
    captureException(exception);

    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Terjadi kesalahan pada server',
      error: 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
