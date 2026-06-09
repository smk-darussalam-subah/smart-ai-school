import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogInput {
  actorId: string | null;
  actorUsername: string | null;
  actorRoles: string[];
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  method: string;
  path: string;
  statusCode: number;
  outcome: string;
  ip: string | null;
  userAgent: string | null;
  metadata: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        actorUsername: data.actorUsername,
        actorRoles: data.actorRoles,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        method: data.method,
        path: data.path,
        statusCode: data.statusCode,
        outcome: data.outcome,
        ip: data.ip,
        userAgent: data.userAgent,
        metadata: data.metadata ?? Prisma.JsonNull,
      },
    });
  }

  async findAll(filters: ListAuditLogsDto): Promise<{
    data: Awaited<ReturnType<PrismaService['auditLog']['findMany']>>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.action) where.action = filters.action;
    if (filters.statusCode !== undefined) where.statusCode = filters.statusCode;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset,
        take: filters.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, limit: filters.limit, offset: filters.offset };
  }
}
