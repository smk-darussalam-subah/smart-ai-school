// =============================================================================
// Keycloak Admin REST API Types (Keycloak 24)
// =============================================================================

export interface KcUserRepresentation {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
  createdTimestamp: number;
}

export interface KcRoleRepresentation {
  id: string;
  name: string;
  composite: boolean;
  clientRole: boolean;
  containerId: string;
}

export interface CreateKcUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
}

export interface KcTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
}

export interface KcTokenCache {
  accessToken: string;
  expiresAt: number;
}
