import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DisplayDeviceProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisplayPairingDto, RotateDisplayCredentialDto } from './display-device.dto';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const DEVICE_LOCK = 'operational:display-device:mutation:v1';
const CREDENTIAL_BYTES = 32;

export interface AuthenticatedDisplayDevice {
  id: string;
  profile: DisplayDeviceProfile;
  label: string;
  audioEnabled: boolean;
  isAudibleLeader: boolean;
  credentialVersion: number;
}

@Injectable()
export class DisplayDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(now = new Date()) {
    const devices = await this.prisma.displayDevice.findMany({
      select: {
        id: true,
        profile: true,
        label: true,
        status: true,
        credentialVersion: true,
        expiresAt: true,
        activatedAt: true,
        lastSeenAt: true,
        revokedAt: true,
        audioEnabled: true,
        isAudibleLeader: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ profile: 'asc' }, { createdAt: 'desc' }],
    });
    return devices.map((device) => ({
      ...device,
      status: this.operationalStatus(device, now),
    }));
  }

  async createPairing(dto: CreateDisplayPairingDto, actorId: string) {
    const expiresAt = dto.credentialExpiresAt ? new Date(dto.credentialExpiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('Masa berlaku credential harus di masa depan');
    const pairingCode = this.createPairingCode();
    const challengeHash = this.hash(pairingCode);
    const challengeExpiresAt = new Date(Date.now() + PAIRING_TTL_MS);

    const device = await this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      return tx.displayDevice.create({
        data: {
          profile: dto.profile,
          label: dto.label,
          createdBy: actorId,
          expiresAt,
          audioEnabled: dto.profile === 'RUANG_GURU' && dto.audioEnabled,
          pairingChallenges: {
            create: {
              challengeHash,
              expiresAt: challengeExpiresAt,
              maxAttempts: PAIRING_MAX_ATTEMPTS,
              createdBy: actorId,
            },
          },
        },
        select: { id: true, profile: true, label: true, status: true },
      });
    });

    return { ...device, pairingCode, expiresAt: challengeExpiresAt, attemptsAllowed: PAIRING_MAX_ATTEMPTS };
  }

  async rotate(id: string, dto: RotateDisplayCredentialDto, actorId: string) {
    const pairingCode = this.createPairingCode();
    const challengeHash = this.hash(pairingCode);
    const challengeExpiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    const credentialExpiresAt = dto.credentialExpiresAt === undefined
      ? undefined
      : dto.credentialExpiresAt ? new Date(dto.credentialExpiresAt) : null;
    if (credentialExpiresAt && credentialExpiresAt <= new Date()) {
      throw new BadRequestException('Masa berlaku credential harus di masa depan');
    }

    const device = await this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      const current = await tx.displayDevice.findUnique({ where: { id } });
      if (!current || current.status === 'REVOKED') throw new NotFoundException('Perangkat tidak ditemukan');
      await tx.displayPairingChallenge.updateMany({
        where: { deviceId: id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.displayDevice.update({
        where: { id },
        data: {
          status: 'PENDING',
          credentialHash: null,
          credentialVersion: { increment: 1 },
          activatedAt: null,
          lastSeenAt: null,
          isAudibleLeader: false,
          ...(credentialExpiresAt !== undefined ? { expiresAt: credentialExpiresAt } : {}),
        },
      });
      await tx.displayPairingChallenge.create({
        data: {
          deviceId: id,
          challengeHash,
          expiresAt: challengeExpiresAt,
          maxAttempts: PAIRING_MAX_ATTEMPTS,
          createdBy: actorId,
        },
      });
      return tx.displayDevice.findUniqueOrThrow({
        where: { id },
        select: { id: true, profile: true, label: true, status: true, credentialVersion: true },
      });
    });
    return { ...device, pairingCode, expiresAt: challengeExpiresAt, attemptsAllowed: PAIRING_MAX_ATTEMPTS };
  }

  async activate(deviceId: string, pairingCode: string) {
    const credential = randomBytes(CREDENTIAL_BYTES).toString('base64url');
    const credentialHash = this.hash(credential);
    const challengeHash = this.hash(pairingCode);
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      const challenge = await tx.displayPairingChallenge.findFirst({
        where: { deviceId, consumedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, challengeHash: true, expiresAt: true, attempts: true, maxAttempts: true },
      });
      if (!challenge || challenge.expiresAt <= now || challenge.attempts >= challenge.maxAttempts) {
        return { ok: false as const };
      }
      if (challenge.challengeHash !== challengeHash) {
        await tx.displayPairingChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null, attempts: challenge.attempts },
          data: { attempts: { increment: 1 } },
        });
        return { ok: false as const };
      }

      const consumed = await tx.displayPairingChallenge.updateMany({
        where: {
          id: challenge.id,
          challengeHash,
          consumedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: challenge.maxAttempts },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return { ok: false as const };

      const activated = await tx.displayDevice.updateMany({
        where: {
          id: deviceId,
          status: 'PENDING',
          credentialHash: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { status: 'ACTIVE', credentialHash, activatedAt: now, lastSeenAt: now },
      });
      if (activated.count !== 1) return { ok: false as const };
      const device = await tx.displayDevice.findUniqueOrThrow({
        where: { id: deviceId },
        select: { id: true, profile: true, label: true, expiresAt: true, credentialVersion: true },
      });
      return { ok: true as const, device };
    });

    if (!outcome.ok) throw new UnauthorizedException('Aktivasi perangkat gagal');
    return { device: outcome.device, credential };
  }

  async revoke(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      const now = new Date();
      const result = await tx.displayDevice.updateMany({
        where: { id, status: { not: 'REVOKED' } },
        data: {
          status: 'REVOKED',
          credentialHash: null,
          revokedAt: now,
          isAudibleLeader: false,
          credentialVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new NotFoundException('Perangkat tidak ditemukan');
      await tx.displayPairingChallenge.updateMany({
        where: { deviceId: id, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.classSessionAlertDelivery.updateMany({
        where: { deviceId: id, status: { in: ['PENDING', 'DELIVERED', 'PLAYED'] } },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      return { revoked: true, actorId };
    });
  }

  async revokeAll(actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      const now = new Date();
      const devices = await tx.displayDevice.findMany({
        where: { status: { not: 'REVOKED' } },
        select: { id: true },
      });
      const ids = devices.map((device) => device.id);
      if (ids.length > 0) {
        await tx.displayPairingChallenge.updateMany({ where: { deviceId: { in: ids }, consumedAt: null }, data: { consumedAt: now } });
        await tx.classSessionAlertDelivery.updateMany({
          where: { deviceId: { in: ids }, status: { in: ['PENDING', 'DELIVERED', 'PLAYED'] } },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        await tx.displayDevice.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'REVOKED', credentialHash: null, revokedAt: now,
            isAudibleLeader: false, credentialVersion: { increment: 1 },
          },
        });
      }
      return { revokedCount: ids.length, actorId };
    });
  }

  async setAudibleLeader(id: string, enabled: boolean) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.acquireMutationLock(tx);
        const device = await tx.displayDevice.findUnique({ where: { id } });
        if (!device || device.status !== 'ACTIVE' || device.revokedAt) {
          throw new NotFoundException('Perangkat aktif tidak ditemukan');
        }
        if (enabled && (device.profile !== 'RUANG_GURU' || !device.audioEnabled)) {
          throw new BadRequestException('Audible leader harus perangkat Ruang Guru dengan audio aktif');
        }
        if (enabled) {
          await tx.displayDevice.updateMany({
            where: { profile: device.profile, id: { not: id }, isAudibleLeader: true },
            data: { isAudibleLeader: false },
          });
        }
        return tx.displayDevice.update({
          where: { id },
          data: { isAudibleLeader: enabled },
          select: { id: true, profile: true, label: true, audioEnabled: true, isAudibleLeader: true },
        });
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Audible leader lain sudah aktif untuk profile ini');
      }
      throw error;
    }
  }

  async authenticateCredential(credential: string | undefined): Promise<AuthenticatedDisplayDevice> {
    if (!credential || credential.length < 40 || credential.length > 100) {
      throw new UnauthorizedException('Akses perangkat tidak valid');
    }
    const now = new Date();
    const device = await this.prisma.displayDevice.findFirst({
      where: {
        credentialHash: this.hash(credential),
        status: 'ACTIVE',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true, profile: true, label: true, audioEnabled: true,
        isAudibleLeader: true, credentialVersion: true,
      },
    });
    if (!device) throw new UnauthorizedException('Akses perangkat tidak valid');
    await this.prisma.displayDevice.updateMany({
      where: { id: device.id, status: 'ACTIVE', revokedAt: null },
      data: { lastSeenAt: now },
    });
    return device;
  }

  assertTrustedActivationOrigin(origin: string | undefined) {
    const configured = [process.env.WEB_URL, process.env.NEXTAUTH_URL, process.env.AUTH_URL]
      .filter((value): value is string => Boolean(value))
      .map((value) => {
        try { return new URL(value).origin; } catch { return ''; }
      })
      .filter(Boolean);
    if (configured.length === 0 && process.env.NODE_ENV !== 'production') {
      if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return;
    }
    if (!origin || !configured.includes(origin)) throw new ForbiddenException('Aktivasi perangkat tidak diizinkan');
  }

  private createPairingCode() {
    return randomBytes(9).toString('base64url');
  }

  private hash(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private operationalStatus(
    device: { status: string; revokedAt: Date | null; expiresAt: Date | null },
    now: Date,
  ) {
    if (
      device.status === 'ACTIVE'
      && !device.revokedAt
      && device.expiresAt
      && device.expiresAt <= now
    ) {
      return 'EXPIRED' as const;
    }
    return device.status;
  }

  private async acquireMutationLock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${DEVICE_LOCK}))`);
  }
}
