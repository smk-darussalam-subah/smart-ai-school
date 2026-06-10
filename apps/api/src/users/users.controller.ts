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
import { ListUsersQuerySchema } from './dto/list-users.dto';
import { UpdateUserRoleSchema } from './dto/update-user.dto';
import { UpdateUserActiveSchema } from './dto/update-user.dto';

@Controller('users')
@Roles('SUPER_ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('permissions.read')
  async findAll(@Query() rawQuery: unknown) {
    const parsed = ListUsersQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.usersService.findAll(parsed.data);
  }

  @Get(':id')
  @RequirePermission('permissions.read')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @RequirePermission('permissions.manage')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateUserRoleSchema)) dto: { role: UserRole },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.updateRole(id, dto.role, actor.keycloakId);
  }

  @Patch(':id/active')
  @RequirePermission('permissions.manage')
  async updateActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateUserActiveSchema)) dto: { isActive: boolean },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.updateActive(id, dto.isActive, actor.keycloakId);
  }
}
