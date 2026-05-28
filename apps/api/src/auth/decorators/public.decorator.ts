import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark route sebagai public (tidak perlu auth)
 * @example @Public() @Get('health')
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
