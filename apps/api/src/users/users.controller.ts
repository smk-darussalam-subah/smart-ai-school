import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AuthUser, UserRole } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import { ListUsersQuerySchema, GroupedUsersQuerySchema } from './dto/list-users.dto';
import { UpdateUserRoleSchema } from './dto/update-user.dto';
import { UpdateUserActiveSchema } from './dto/update-user.dto';

@Controller('users')
@Roles('SUPER_ADMIN', 'TATA_USAHA')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/grouped — users grouped by 7 roles (accordion)
   */
  @Get('grouped')
  @RequirePermission('user.read')
  async findGrouped(@Query() rawQuery: unknown) {
    const parsed = GroupedUsersQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.usersService.findGrouped(parsed.data);
  }

  @Get()
  @RequirePermission('user.read')
  async findAll(@Query() rawQuery: unknown) {
    const parsed = ListUsersQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.usersService.findAll(parsed.data);
  }

  /**
   * GET /users/:id/effective-permissions — resolved permission codes
   * MUST be declared before @Get(':id') to avoid route collision.
   */
  @Get(':id/effective-permissions')
  @Roles('SUPER_ADMIN')
  @RequirePermission('permissions.read')
  async getEffectivePermissions(@Param('id', ParseUUIDPipe) id: string) {
    const permissions = await this.usersService.getEffectivePermissions(id);
    return { permissions };
  }

  @Get(':id')
  @RequirePermission('user.read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @RequirePermission('user.manage')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateUserRoleSchema)) dto: { role: UserRole },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.updateRole(id, dto.role, actor.keycloakId);
  }

  @Patch(':id/active')
  @RequirePermission('user.manage')
  async updateActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateUserActiveSchema)) dto: { isActive: boolean },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.updateActive(id, dto.isActive, actor.keycloakId);
  }
}
