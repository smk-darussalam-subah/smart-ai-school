import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'crypto';

export const APPOINTMENT_AUTOMATION_HEADER = 'x-diis-automation-token';
const MIN_TOKEN_BYTES = 32;

@Injectable()
export class AppointmentAutomationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.APPOINTMENT_AUTOMATION_TOKEN;
    if (!expected || Buffer.byteLength(expected, 'utf8') < MIN_TOKEN_BYTES) {
      throw new ForbiddenException('Appointment automation credential is not configured.');
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const rawHeader = request.headers[APPOINTMENT_AUTOMATION_HEADER];
    const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!provided || typeof provided !== 'string') {
      throw new ForbiddenException('Appointment automation credential is invalid.');
    }

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (providedBuffer.length !== expectedBuffer.length) {
      timingSafeEqual(expectedBuffer, expectedBuffer);
      throw new ForbiddenException('Appointment automation credential is invalid.');
    }
    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      throw new ForbiddenException('Appointment automation credential is invalid.');
    }

    return true;
  }
}
