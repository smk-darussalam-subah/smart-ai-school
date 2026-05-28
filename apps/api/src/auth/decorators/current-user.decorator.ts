import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@smk/auth';

/**
 * Inject user dari request ke parameter controller
 * @example async getProfile(@CurrentUser() user: AuthUser) {}
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
