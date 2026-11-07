import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { logoutAuditId } from '../auth/session-binding';

interface WaitingRead {
  start: () => void;
  reject: (error: Error) => void;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
}

/** Limit concurrent snapshot readers before they acquire scarce DB connections.
 * Authority and all data are still read inside the admitted transaction, so a
 * queued request cannot retain permissions or a parent relationship from preview.
 */
export class JpReadAdmission {
  private active = 0;
  private readonly waiting: WaitingRead[] = [];
  private readonly perPrincipal = new Map<string, number>();

  constructor(
    private readonly concurrency = 2,
    private readonly maxWaiting = 800,
    private readonly waitMs = 15_000,
    private readonly maxPerPrincipal = 4,
  ) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isInteger(maxWaiting) ||
      maxWaiting < 0 ||
      !Number.isFinite(waitMs) ||
      waitMs < 1 ||
      !Number.isInteger(maxPerPrincipal) ||
      maxPerPrincipal < 1
    )
      throw new Error('Invalid JP read admission limits');
  }

  async run<T>(principal: string, work: () => Promise<T>): Promise<T> {
    const deadline = performance.now() + this.waitMs;
    const owned = this.perPrincipal.get(principal) ?? 0;
    if (
      owned >= this.maxPerPrincipal ||
      (this.active >= this.concurrency && this.waiting.length >= this.maxWaiting)
    )
      throw this.busy();
    this.perPrincipal.set(principal, owned + 1);
    try {
      if (this.active < this.concurrency) this.active++;
      else await this.acquire(deadline);
    } catch (error) {
      this.releasePrincipal(principal);
      throw error;
    }
    try {
      // Promise continuations may run before delayed timer callbacks.
      if (performance.now() >= deadline) throw this.busy();
      return await work();
    } finally {
      this.releasePrincipal(principal);
      this.releaseSlot();
    }
  }

  private acquire(deadline: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const entry: WaitingRead = {
        start: resolve,
        reject,
        deadline,
        timer: setTimeout(
          () => {
            const index = this.waiting.indexOf(entry);
            if (index !== -1) {
              this.waiting.splice(index, 1);
              reject(this.busy());
            }
          },
          Math.max(0, deadline - performance.now()),
        ),
      };
      this.waiting.push(entry);
    });
  }

  private releaseSlot() {
    let next: WaitingRead | undefined;
    while ((next = this.waiting.shift())) {
      clearTimeout(next.timer);
      if (performance.now() >= next.deadline) {
        next.reject(this.busy());
        continue;
      }
      next.start();
      return;
    }
    this.active--;
  }

  private releasePrincipal(principal: string) {
    const count = (this.perPrincipal.get(principal) ?? 1) - 1;
    if (count) this.perPrincipal.set(principal, count);
    else this.perPrincipal.delete(principal);
  }

  private busy() {
    return new ServiceUnavailableException({
      message: 'Rekap sedang sibuk. Coba lagi sebentar.',
      code: 'JP_READ_BUSY',
      retryAfterSeconds: 2,
    });
  }
}

// The two JP readers share a budget for the same Prisma client. A separate
// database/client does not share authority, cached data, or queued work.
const readers = new WeakMap<object, JpReadAdmission>();
export function withJpRead<T>(client: object, principal: string, work: () => Promise<T>) {
  let admission = readers.get(client);
  if (!admission) {
    admission = new JpReadAdmission();
    readers.set(client, admission);
  }
  return admission.run(principal, work);
}

/** A logout committed while waiting also closes the admitted read. */
export async function assertJpReadSession(tx: Prisma.TransactionClient, user: AuthUser) {
  if (!user.sessionBinding) return;
  const revoked = await tx.auditLog.findUnique({
    where: { id: logoutAuditId(user.sessionBinding) },
    select: { id: true },
  });
  if (revoked) throw new UnauthorizedException('Sesi Anda telah berakhir. Silakan masuk kembali.');
}
