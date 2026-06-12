// =============================================================================
// AuthService — Logika /auth/me (read + update profil diri sendiri)
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserRole } from '@smk/auth';
import { UpdateMeDto } from './dto/update-me.dto';

// Select fields yang dikembalikan ke client — tidak ekspos data sensitif
const ME_SELECT = {
  id: true,
  keycloakId: true,
  email: true,
  fullName: true,
  role: true,
  phone: true,
  isActive: true,
} as const;

export type MeResponse = {
  id: string;
  keycloakId: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  /**
   * Ambil profil user berdasarkan keycloakId (dari JWT).
   * Menggunakan data DB — bukan JWT — agar role selalu sinkron dengan DB.
   * Termasuk effective permissions dari role + override.
   */
  async getMe(keycloakId: string, roles: UserRole[]): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan di database');
    }

    // Resolve effective permissions.
    // SUPER_ADMIN → wildcard '*' (kontrak dgn web lib/permissions.can()):
    // hasPermission() backend memang bypass SA, tapi getEffectivePermissions
    // membaca DB — bila seed tertinggal, daftar SA bisa bolong dan menu SA
    // ikut hilang. Wildcard menghilangkan ketergantungan pada kelengkapan seed.
    if (roles.includes('SUPER_ADMIN')) {
      return { ...user, permissions: ['*'] };
    }
    const permSet = await this.permissionsService.getEffectivePermissions(keycloakId, roles);
    const permissions = Array.from(permSet).sort();

    return { ...user, permissions };
  }

  /**
   * Update phone/avatarUrl user.
   * Hanya field yang di-passing UpdateMeDto — tidak ada field lain yang bisa diubah.
   */
  async updateMe(keycloakId: string, dto: UpdateMeDto): Promise<Omit<MeResponse, 'permissions'>> {
    const existing = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('User tidak ditemukan di database');
    }

    return this.prisma.user.update({
      where: { keycloakId },
      data: dto,
      select: ME_SELECT,
    });
  }
}
