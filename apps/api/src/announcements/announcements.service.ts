// =============================================================================
// AnnouncementsService — Pengumuman Sekolah (referensi KamilEdu Modul 14)
//
// Visibilitas (filter di QUERY level — doktrin proyek):
//   - Manager (SUPER_ADMIN/KEPALA_SEKOLAH): lihat semua status.
//   - Role lain: hanya status=published, audiens cocok (role ∈ audience
//     atau audience memuat "ALL"), dan scheduledAt null/sudah lewat.
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementPublishedPayload, EVENTS } from '../events/events.types';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

const MANAGER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as const;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitPublished(a: {
    id: string; title: string; category: string; priority: string; audience: unknown;
  }): void {
    this.eventEmitter.emit(EVENTS.ANNOUNCEMENT_PUBLISHED, {
      announcementId: a.id,
      title: a.title,
      category: String(a.category),
      priority: String(a.priority),
      audience: Array.isArray(a.audience) ? (a.audience as string[]) : ['ALL'],
    } satisfies AnnouncementPublishedPayload);
  }

  private isManager(user: AuthUser): boolean {
    return user.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r));
  }

  /** Klausa visibilitas untuk non-manager — selalu diterapkan di QUERY. */
  private visibilityWhere(user: AuthUser): Prisma.AnnouncementWhereInput {
    return {
      status: 'published',
      OR: [
        { audience: { array_contains: ['ALL'] } },
        ...user.roles.map((role) => ({
          audience: { array_contains: [role] } as Prisma.JsonFilter,
        })),
      ],
      AND: [
        {
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
      ],
    };
  }

  async findAll(query: ListAnnouncementsQueryDto, user: AuthUser) {
    const { status, category, search, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AnnouncementWhereInput = this.isManager(user)
      ? {
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
        }
      : {
          ...this.visibilityWhere(user),
          ...(category ? { category } : {}),
        };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: AuthUser) {
    const where: Prisma.AnnouncementWhereInput = this.isManager(user)
      ? { id }
      : { id, ...this.visibilityWhere(user) };

    const announcement = await this.prisma.announcement.findFirst({ where });
    // 404 (bukan 403) untuk non-visible — tidak membocorkan keberadaan resource
    if (!announcement) throw new NotFoundException('Pengumuman tidak ditemukan');
    return announcement;
  }

  async create(dto: CreateAnnouncementDto, user: AuthUser) {
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category,
        priority: dto.priority,
        audience: dto.audience as Prisma.InputJsonValue,
        isPinned: dto.isPinned,
        status: dto.status,
        publishedAt: dto.status === 'published' ? new Date() : null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy: user.keycloakId,
        createdByName: user.username,
      },
    });
    if (created.status === 'published') this.emitPublished(created);
    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    const data: Prisma.AnnouncementUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.content !== undefined ? { content: dto.content } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.audience !== undefined
        ? { audience: dto.audience as Prisma.InputJsonValue }
        : {}),
      ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
      ...(dto.scheduledAt !== undefined
        ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }
        : {}),
    };

    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status;
      if (dto.status === 'published' && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const updated = await this.prisma.announcement.update({ where: { id }, data });
    if (dto.status === 'published' && existing.status !== 'published') {
      this.emitPublished(updated);
    }
    return updated;
  }

  async publish(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    const published = await this.prisma.announcement.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });
    if (existing.status !== 'published') this.emitPublished(published);
    return published;
  }

  async archive(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'archived', isPinned: false },
    });
  }

  async setPin(id: string, isPinned: boolean, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.announcement.update({ where: { id }, data: { isPinned } });
  }

  /** Hard delete aman: tabel tanpa FK masuk/keluar — dummy bisa dihapus bersih. */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.announcement.delete({ where: { id } });
    return { deleted: true, id };
  }
}
