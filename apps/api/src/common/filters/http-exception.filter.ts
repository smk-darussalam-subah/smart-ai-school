// =============================================================================
// HttpExceptionFilter — Global error handler
// Memastikan tidak ada stack trace yang bocor ke client di production
// =============================================================================

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { captureException } from '@sentry/nestjs';
import { logError } from '@smk/logger';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Terjadi kesalahan pada server';
    let errorType = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string | string[]) || message;
        errorType = (resp.error as string) || exception.name;
      }

      // Kirim ke Sentry hanya untuk 5xx — 4xx (400/401/403/404/409/422) adalah noise
      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        captureException(exception);
      }
    } else if (exception instanceof Error) {
      // Jangan expose detail error internal ke client
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message;
      }

      logError('Unhandled exception', exception, {
        path: request.url,
        method: request.method,
      });

      // Semua unhandled non-HttpException error = 500 → selalu capture
      captureException(exception);
    }

    const response: ErrorResponse = {
      statusCode,
      message,
      error: errorType,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    reply.status(statusCode).send(response);
  }
}
