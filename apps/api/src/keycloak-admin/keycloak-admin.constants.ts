export const KEYCLOAK_ADMIN_REQUEST_TIMEOUT_MS = 10_000;
export const KEYCLOAK_ADMIN_RETRY_ATTEMPT = 1;

export function keycloakAdminCallBudgetMs(
  requestTimeoutMs = KEYCLOAK_ADMIN_REQUEST_TIMEOUT_MS,
  retryAttempt = KEYCLOAK_ADMIN_RETRY_ATTEMPT,
): number {
  return requestTimeoutMs * (retryAttempt + 1);
}
