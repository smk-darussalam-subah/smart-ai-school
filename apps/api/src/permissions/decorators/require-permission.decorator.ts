import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

export type RequiredPermission = string | string[];

export const RequirePermission = (permission: RequiredPermission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
