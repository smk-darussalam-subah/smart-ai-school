import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class SchedulingAudit {
  /** Domain success is atomic with draft/receipt. HTTP audit is intentionally separate. */
  async record(tx: Prisma.TransactionClient, actorId: string, operation: string,
    versionId: string, revision: number, inputDigest: string, requestHash: string) {
    await tx.auditLog.create({ data: {
      actorId, actorRoles: ['SUPER_ADMIN'], action: 'scheduling.domain.' + operation,
      resourceType: 'scheduling_version', resourceId: versionId, method: 'DOMAIN',
      path: '/scheduling/drafts', statusCode: 200, outcome: 'success',
      metadata: { revision, inputDigest, requestHash },
    } });
  }
}
