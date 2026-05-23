// =============================================================================
// Shared Logger — Smart AI School
// Winston logger dikonfigurasi untuk structured logging (JSON) di production
// dan colorized output di development
// =============================================================================

import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    isDevelopment ? combine(colorize({ all: true }), simple()) : json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'smk-service',
  },
  transports: [
    new winston.transports.Console(),
    ...(isDevelopment
      ? []
      : [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 30,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 30,
          }),
        ]),
  ],
});

// ── Helper functions ─────────────────────────────────────────────────────────

/**
 * Log aksi user untuk audit trail
 * @example auditLog('CREATE', 'student', studentId, userId)
 */
export function auditLog(
  action: string,
  resource: string,
  resourceId: string,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  logger.info('AUDIT', {
    action,
    resource,
    resourceId,
    userId,
    ...metadata,
    type: 'audit',
  });
}

/**
 * Log error dengan konteks tambahan
 */
export function logError(
  message: string,
  error: Error,
  context?: Record<string, unknown>
): void {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
}

export default logger;
