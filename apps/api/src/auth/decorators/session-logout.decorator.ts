import { SetMetadata } from '@nestjs/common';

export const SESSION_LOGOUT_KEY = 'diis:session-logout-only';
/** Signature/issuer remain mandatory. Expired/revoked identity may only revoke
 * its verified session; never use this metadata on a business route. */
export const SessionLogoutOnly = () => SetMetadata(SESSION_LOGOUT_KEY, true);
