// =============================================================================
// AuthService — Logika /auth/me (read + update profil diri sendiri)
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';

// Select fields yang dikembalikan ke client — tidak ekspos data sensitif
const ME_SELECT = {
  id: true,
  keycloakId: true,
  email: true,
  fullName: true,
  role: true,
} as const;

export type MeResponse = {
  id: string;
  keycloakId: string;
  email: string;
  fullName: string;
  role: string;
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ambil profil user berdasarkan keycloakId (dari JWT).
   * Menggunakan data DB — bukan JWT — agar role selalu sinkron dengan DB.
   */
  async getMe(keycloakId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: ME_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan di database');
    }

    return user;
  }

  /**
   * Update phone/avatarUrl user.
   * Hanya field yang di-passing UpdateMeDto — tidak ada field lain yang bisa diubah.
   */
  async updateMe(keycloakId: string, dto: UpdateMeDto): Promise<MeResponse> {
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
