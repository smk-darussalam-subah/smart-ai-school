import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import {
  DeviceDeliveryAcknowledgementSchema,
  OperationalMonitoringQuerySchema,
} from './operational-monitoring.dto';
import { OperationalMonitoringService } from './operational-monitoring.service';

@Controller('operational-monitoring')
export class OperationalMonitoringController {
  constructor(private readonly service: OperationalMonitoringService) {}

  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'KEPALA_SEKOLAH')
  @RequirePermission('operational.monitoring.read')
  @Get('snapshot')
  snapshot(@Query() rawQuery: unknown) {
    const parsed = OperationalMonitoringQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.privateSnapshot(parsed.data);
  }
}

@Public()
@Controller('display')
export class OperationalDisplayController {
  constructor(private readonly service: OperationalMonitoringService) {}

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get('snapshot')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  snapshot(@Headers('x-diis-display-credential') credential?: string) {
    return this.service.deviceSnapshot(credential);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('stream')
  @Header('Cache-Control', 'no-store')
  async stream(
    @Headers('x-diis-display-credential') credential: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.service.deviceSnapshot(credential);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const subscription = this.service.streamDevice(credential).subscribe({
      next: (event) => reply.raw.write(serializeDisplayEvent(event)),
      error: () => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(
            'event: error\ndata: {"message":"Perangkat perlu dipasangkan kembali."}\n\n',
          );
          reply.raw.end();
        }
      },
      complete: () => {
        if (!reply.raw.writableEnded) reply.raw.end();
      },
    });

    request.raw.once('close', () => subscription.unsubscribe());
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Audit({
    action: 'displayDelivery.delivered',
    resourceType: 'display_delivery',
    captureBody: false,
  })
  @Post('deliveries/:id/delivered')
  delivered(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-diis-display-credential') credential?: string,
  ) {
    return this.service.markDelivered(credential, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Audit({ action: 'displayDelivery.played', resourceType: 'display_delivery', captureBody: false })
  @Post('deliveries/:id/played')
  played(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-diis-display-credential') credential?: string,
  ) {
    return this.service.markPlayed(credential, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Audit({
    action: 'displayDelivery.acknowledge',
    resourceType: 'display_delivery',
    captureBody: false,
  })
  @Post('deliveries/:id/acknowledge')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-diis-display-credential') credential: string | undefined,
    @Body(ZodPipe(DeviceDeliveryAcknowledgementSchema)) dto: { reason?: string },
  ) {
    return this.service.acknowledge(credential, id, dto.reason);
  }
}

export function serializeDisplayEvent(event: MessageEvent): string {
  const type = event.type ? String(event.type).replace(/[\r\n]/g, '') : 'message';
  const id = event.id ? `id: ${String(event.id).replace(/[\r\n]/g, '')}\n` : '';
  return `event: ${type}\n${id}data: ${JSON.stringify(event.data)}\n\n`;
}
