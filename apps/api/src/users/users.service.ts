import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatusService } from '../auth/user-status.service';
import { UserRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { ListUsersQuery } from './dto/list-users.dto';

const USER_SELECT = {
  id: true,
  keycloakId: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService,
    private readonly userStatus: UserStatusService,
  ) {}

  async findAll(query: ListUsersQuery) {
    const { role, search, isActive, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        student: { select: { id: true, nis: true } },
        teacher: { select: { id: true, nip: true } },
      },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  async updateRole(id: string, role: UserRole, actor: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, role: true } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    });

    logger.info(`User role updated: ${user.fullName} ${user.role} → ${role}`, {
      actor,
      userId: id,
      oldRole: user.role,
      newRole: role,
    });

    return updated;
  }

  async updateActive(id: string, isActive: boolean, actor: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SELECT,
    });

    // 2J-0: efek instan — token berikutnya langsung ditolak/diloloskan
    this.userStatus.invalidate(updated.keycloakId);

    logger.info(`User ${isActive ? 'activated' : 'deactivated'}: ${user.fullName}`, {
      actor,
      userId: id,
    });

    return updated;
  }
}
