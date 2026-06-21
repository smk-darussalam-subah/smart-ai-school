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

    // Izin diturunkan dari ROLE di token — TIDAK bergantung pada ada/tidaknya
    // baris DB. SUPER_ADMIN → wildcard '*' (kontrak dgn web lib/permissions.can()):
    // getEffectivePermissions membaca DB; bila seed tertinggal daftar SA bisa
    // bolong dan menu SA ikut hilang. Wildcard menghilangkan ketergantungan itu.
    const permissions = roles.includes('SUPER_ADMIN')
      ? ['*']
      : Array.from(await this.permissionsService.getEffectivePermissions(keycloakId, roles)).sort();

    if (!user) {
      // Token sah tapi belum ada profil DB (mis. akun dibuat langsung di Keycloak,
      // belum diprovisi — insiden inspector 2026-06-13). JANGAN 404: itu membuat
      // /auth/me gagal → web menerima null → sidebar runtuh ke menu kosong.
      // Kembalikan profil minimal + izin dari role agar UI tetap benar.
      return {
        id: '',
        keycloakId,
        email: '',
        fullName: '',
        role: (roles[0] ?? '') as string,
        phone: null,
        isActive: true,
        permissions,
      };
    }

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
