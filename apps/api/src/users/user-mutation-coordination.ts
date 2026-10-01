import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KEYCLOAK_ADMIN_REQUEST_TIMEOUT_MS,
  KEYCLOAK_ADMIN_RETRY_ATTEMPT,
  keycloakAdminCallBudgetMs,
} from '../keycloak-admin/keycloak-admin.constants';

const USER_MUTATION_LOCK_PREFIX = 'user-identity-mutation:';
export const KEYCLOAK_TRANSACTION_MARGIN_MS = 15_000;

// Keep the database ownership alive for every bounded Keycloak attempt plus commit margin.
export function createKeycloakMutationTransactionOptions(input: {
  callCount: number;
  requestTimeoutMs?: number;
  retryAttempt?: number;
  marginMs?: number;
}) {
  const requestTimeoutMs = input.requestTimeoutMs ?? KEYCLOAK_ADMIN_REQUEST_TIMEOUT_MS;
  const retryAttempt = input.retryAttempt ?? KEYCLOAK_ADMIN_RETRY_ATTEMPT;
  const marginMs = input.marginMs ?? KEYCLOAK_TRANSACTION_MARGIN_MS;
  return {
    maxWait: 5_000,
    timeout: keycloakAdminCallBudgetMs(requestTimeoutMs, retryAttempt) * input.callCount + marginMs,
  };
}

export async function acquireUserMutationLocks(
  tx: Prisma.TransactionClient,
  userIds: readonly string[],
): Promise<void> {
  // Stable ordering prevents actor/target inversions from creating a lock cycle.
  const orderedUserIds = Array.from(new Set(userIds)).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  for (const userId of orderedUserIds) {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(
      Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`${USER_MUTATION_LOCK_PREFIX}${userId}`}, 0)) AS acquired`,
    );
    if (!lock?.acquired) {
      throw new ConflictException(
        'Perubahan pengguna ini sedang diproses. Tunggu hasil sebelumnya lalu coba lagi.',
      );
    }
  }
}
