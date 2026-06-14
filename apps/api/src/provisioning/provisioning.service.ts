// =============================================================================
// ProvisioningService — Pembuatan akun pengguna via Keycloak Admin API + DB.
//
// Saga: KC dulu, DB kemudian; gagal DB → kompensasi hapus KC.
// Otorisasi penerbit di SERVICE (fail-closed): SA → semua, TU → GURU/SISWA/OT/INDUSTRI.
// =============================================================================

import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserStatusService } from '../auth/user-status.service';
import { normalizeOrThrow } from '../common/helpers/phone';
import {
  ProvisionUserDto,
  ProvisionStudentDto,
  ProvisionUserSchema,
  STAFF_ROLES,
} from './dto/provision.dto';

const DOMAIN = 'smkdarussalamsubah.sch.id';

function syntheticEmailNis(nis: string): string {
  return `${nis}@siswa.${DOMAIN}`;
}

function syntheticEmailOrtu(phoneE164: string): string {
  const noPlus = phoneE164.replace('+', '');
  return `${noPlus}@ortu.${DOMAIN}`;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

export interface TempCredential {
  username: string;
  tempPassword: string;
}

export interface ProvisionResult {
  user: { id: string; keycloakId: string; email: string; fullName: string; role: string };
  tempCredentials: TempCredential[];
}

export interface BulkRowResult {
  index: number;
  status: 'ok' | 'error';
  error?: string;
  user?: ProvisionResult['user'];
  tempCredentials?: TempCredential[];
}

export interface Actor {
  keycloakId: string;
  roles: UserRole[];
}

@Injectable()
export class ProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kc: KeycloakAdminService,
    private readonly permissions: PermissionsService,
    private readonly userStatus: UserStatusService,
  ) {}

  // ── Otorisasi penerbit ──────────────────────────────────────────────────────

  private authorize(actor: Actor, role: UserRole): void {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    if (actor.roles.includes('TATA_USAHA')) {
      const allowed: UserRole[] = ['GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI'];
      if (allowed.includes(role)) return;
    }
    throw new ForbiddenException(
      `Anda tidak diizinkan membuat akun dengan role ${role}`,
    );
  }

  private deriveUsername(dto: ProvisionUserDto): string {
    const { role } = dto;
    if (role === 'ORANG_TUA') return normalizeOrThrow(dto.phone!);
    if (role === 'SISWA') throw new BadRequestException('Gunakan /provision/students untuk SISWA');
    return dto.email!;
  }

  private deriveEmail(dto: ProvisionUserDto): string {
    if (dto.email) return dto.email;
    if (dto.role === 'ORANG_TUA' && dto.phone) {
      return syntheticEmailOrtu(normalizeOrThrow(dto.phone));
    }
    return dto.email!;
  }

  // ── provisionUser ───────────────────────────────────────────────────────────

  async provisionUser(dto: ProvisionUserDto, actor: Actor): Promise<ProvisionResult> {
    this.authorize(actor, dto.role);

    const username = this.deriveUsername(dto);
    const email = this.deriveEmail(dto);
    const tempPw = generateTempPassword();
    const nameParts = dto.fullName.split(' ');
    const firstName = nameParts[0]!;
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // Pre-flight idempotency
    const [kcExisting, dbEmail, dbNiy] = await Promise.all([
      this.kc.findByUsername(username),
      this.prisma.user.findFirst({ where: { email }, select: { id: true } }),
      dto.niy
        ? this.prisma.staff.findUnique({ where: { niy: dto.niy }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    if (kcExisting) throw new ConflictException(`Username "${username}" sudah digunakan di Keycloak`);
    if (dbEmail) throw new ConflictException(`Email "${email}" sudah digunakan`);
    if (dbNiy) throw new ConflictException(`NIY "${dto.niy}" sudah digunakan`);

    let kcId: string | undefined;
    try {
      kcId = await this.kc.createUser({
        username,
        email,
        firstName,
        lastName,
        enabled: true,
      });

      await this.kc.assignRealmRole(kcId, dto.role);
      await this.kc.setTempPassword(kcId, tempPw);

      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            keycloakId: kcId!,
            email,
            fullName: dto.fullName,
            gender: dto.gender,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            address: dto.address ?? null,
            phone: dto.phone ? normalizeOrThrow(dto.phone) : null,
            role: dto.role,
            isActive: true,
          },
          select: { id: true, keycloakId: true, email: true, fullName: true, role: true },
        });

        // Pegawai (KS/Guru/TU) → baris identitas kepegawaian (NIY + status).
        if ((STAFF_ROLES as readonly string[]).includes(dto.role)) {
          await tx.staff.create({
            data: {
              userId: user.id,
              niy: dto.niy ?? null,
              employmentStatus: dto.employmentStatus!,
              joinedAt: new Date(),
            },
          });
        }

        // Guru → baris mengajar (tanpa NIP; identitas kepegawaian ada di staff).
        if (dto.role === 'GURU') {
          await tx.teacher.create({ data: { userId: user.id } });
        }

        return { user };
      });

      this.invalidateCaches(kcId);

      return {
        user: result.user,
        tempCredentials: [{ username, tempPassword: tempPw }],
      };
    } catch (err: unknown) {
      if (kcId) {
        await this.kc.deleteUser(kcId).catch((e) => {
          logger.error('[Provision] gagal kompensasi deleteUser KC', {
            kcId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
      throw err;
    }
  }

  // ── bulkProvisionUsers (import massal, skip baris invalid) ───────────────────

  async bulkProvisionUsers(
    rows: Array<Record<string, unknown>>,
    actor: Actor,
  ): Promise<{
    results: Array<BulkRowResult>;
    summary: { ok: number; fail: number; total: number };
  }> {
    const results: BulkRowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = ProvisionUserSchema.safeParse(rows[i]);
      if (!parsed.success) {
        results.push({
          index: i,
          status: 'error',
          error: parsed.error.issues.map((x) => x.message).join('; '),
        });
        continue;
      }
      try {
        const r = await this.provisionUser(parsed.data, actor);
        results.push({ index: i, status: 'ok', user: r.user, tempCredentials: r.tempCredentials });
      } catch (err: unknown) {
        results.push({
          index: i,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    return { results, summary: { ok, fail: results.length - ok, total: results.length } };
  }

  // ── provisionStudent ────────────────────────────────────────────────────────

  async provisionStudent(dto: ProvisionStudentDto, actor: Actor): Promise<ProvisionResult> {
    this.authorize(actor, 'SISWA');

    const ortuPhone = normalizeOrThrow(dto.ortu.phone);
    const ortuEmail = dto.ortu.email || syntheticEmailOrtu(ortuPhone);
    const ortuUsername = ortuPhone;
    const ortuTempPw = generateTempPassword();

    const siswaEmail = dto.siswa.email || syntheticEmailNis(dto.siswa.nis);
    const siswaUsername = dto.siswa.nis;
    const siswaTempPw = generateTempPassword();

    const siswaNameParts = dto.siswa.fullName.split(' ');
    const siswaFirst = siswaNameParts[0]!;
    const siswaLastName = siswaNameParts.slice(1).join(' ') || siswaFirst;

    const ortuNameParts = dto.ortu.name.split(' ');
    const ortuFirst = ortuNameParts[0]!;
    const ortuLastName = ortuNameParts.slice(1).join(' ') || ortuFirst;

    // Step 1: dedup ortu by phone E.164
    let existingOrtuUser: { id: string; keycloakId: string } | null = null;
    let ortuKcId: string | undefined;
    let ortuIsNew = false;

    if (dto.reuseParentByPhone) {
      existingOrtuUser = await this.prisma.user.findFirst({
        where: { phone: ortuPhone, role: 'ORANG_TUA', deletedAt: null },
        select: { id: true, keycloakId: true },
      });
    }

    // Pre-flight: NIS + KC username
    const [nisExisting, kcSiswaExisting] = await Promise.all([
      this.prisma.student.findUnique({ where: { nis: dto.siswa.nis }, select: { id: true } }),
      this.kc.findByUsername(siswaUsername),
    ]);

    if (nisExisting) throw new ConflictException(`NIS "${dto.siswa.nis}" sudah terdaftar`);
    if (kcSiswaExisting) throw new ConflictException(`Username "${siswaUsername}" sudah digunakan di Keycloak`);

    const createdKcIds: string[] = [];

    try {
      // Step 2: KC create ortu (bila baru)
      if (!existingOrtuUser) {
        const kcOrtuExisting = await this.kc.findByUsername(ortuUsername);
        if (kcOrtuExisting) {
          throw new ConflictException(
            `Username ortu "${ortuUsername}" sudah digunakan — bila ini wali yang sama, kirim ulang dengan reuseParentByPhone: true`,
          );
        }

        ortuKcId = await this.kc.createUser({
          username: ortuUsername,
          email: ortuEmail,
          firstName: ortuFirst,
          lastName: ortuLastName,
          enabled: true,
        });
        createdKcIds.push(ortuKcId);
        ortuIsNew = true;

        await this.kc.assignRealmRole(ortuKcId, 'ORANG_TUA');
        await this.kc.setTempPassword(ortuKcId, ortuTempPw);
      }

      // Step 3: KC create siswa
      const siswaKcId = await this.kc.createUser({
        username: siswaUsername,
        email: siswaEmail,
        firstName: siswaFirst,
        lastName: siswaLastName,
        enabled: true,
      });
      createdKcIds.push(siswaKcId);

      await this.kc.assignRealmRole(siswaKcId, 'SISWA');
      await this.kc.setTempPassword(siswaKcId, siswaTempPw);

      // Step 4: DB transaction
      const result = await this.prisma.$transaction(async (tx) => {
        let parentId: string | undefined = existingOrtuUser?.id;

        if (ortuIsNew && ortuKcId) {
          const ortu = await tx.user.create({
            data: {
              keycloakId: ortuKcId,
              email: ortuEmail,
              fullName: dto.ortu.name,
              phone: ortuPhone,
              role: 'ORANG_TUA',
              isActive: true,
            },
          });
          parentId = ortu.id;
        }

        const consentAt = new Date();

        const siswaUser = await tx.user.create({
          data: {
            keycloakId: siswaKcId,
            email: siswaEmail,
            fullName: dto.siswa.fullName,
            role: 'SISWA',
            isActive: true,
            consentAt,
          },
        });

        await tx.student.create({
          data: {
            userId: siswaUser.id,
            nis: dto.siswa.nis,
            classId: dto.siswa.classId || null,
            parentId: parentId || null,
            joinedAt: new Date(),
          },
        });

        return { user: siswaUser };
      });

      createdKcIds.forEach((id) => this.invalidateCaches(id));

      const creds: TempCredential[] = [{ username: siswaUsername, tempPassword: siswaTempPw }];
      if (ortuIsNew) {
        creds.unshift({ username: ortuUsername, tempPassword: ortuTempPw });
      }

      return {
        user: result.user,
        tempCredentials: creds,
      };
    } catch (err: unknown) {
      for (const kcId of createdKcIds) {
        await this.kc.deleteUser(kcId).catch((e) => {
          logger.error('[Provision] gagal kompensasi deleteUser KC (student saga)', {
            kcId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
      throw err;
    }
  }

  // ── provisionOrtu — dipanggil oleh assignParent ────────────────────────────

  async provisionOrtu(
    input: { name: string; phone: string; email?: string; reuseByPhone: boolean },
    actor: Actor,
  ): Promise<{ userId: string; keycloakId: string; isNew: boolean; tempCredentials: TempCredential[] }> {
    this.authorize(actor, 'ORANG_TUA');

    const ortuPhone = normalizeOrThrow(input.phone);
    const ortuEmail = input.email || syntheticEmailOrtu(ortuPhone);
    const ortuUsername = ortuPhone;

    if (input.reuseByPhone) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: ortuPhone, role: 'ORANG_TUA', deletedAt: null },
        select: { id: true, keycloakId: true },
      });
      if (existing) {
        return { userId: existing.id, keycloakId: existing.keycloakId, isNew: false, tempCredentials: [] };
      }
    }

    const kcExisting = await this.kc.findByUsername(ortuUsername);
    if (kcExisting) {
      throw new ConflictException(
        `Username ortu "${ortuUsername}" sudah digunakan — kirim ulang dengan reuseParentByPhone: true`,
      );
    }

    const tempPw = generateTempPassword();
    const nameParts = input.name.split(' ');
    const firstName = nameParts[0]!;
    const lastName = nameParts.slice(1).join(' ') || firstName;

    let ortuKcId: string | undefined;
    try {
      ortuKcId = await this.kc.createUser({
        username: ortuUsername,
        email: ortuEmail,
        firstName,
        lastName,
        enabled: true,
      });

      await this.kc.assignRealmRole(ortuKcId, 'ORANG_TUA');
      await this.kc.setTempPassword(ortuKcId, tempPw);

      const ortu = await this.prisma.user.create({
        data: {
          keycloakId: ortuKcId,
          email: ortuEmail,
          fullName: input.name,
          phone: ortuPhone,
          role: 'ORANG_TUA',
          isActive: true,
        },
        select: { id: true, keycloakId: true },
      });

      this.invalidateCaches(ortuKcId);

      return {
        userId: ortu.id,
        keycloakId: ortu.keycloakId,
        isNew: true,
        tempCredentials: [{ username: ortuUsername, tempPassword: tempPw }],
      };
    } catch (err: unknown) {
      if (ortuKcId) {
        await this.kc.deleteUser(ortuKcId).catch((e) => {
          logger.error('[Provision] gagal kompensasi deleteUser KC (provisionOrtu)', {
            ortuKcId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
      throw err;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private invalidateCaches(kcId: string): void {
    this.permissions.invalidateUser(kcId);
    this.userStatus.invalidate(kcId);
  }
}
