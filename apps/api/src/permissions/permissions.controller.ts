import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { UserRole } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from './decorators/require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { UpdateRolePermissionsSchema } from './dto/update-role-permissions.dto';
import { UserPermissionOverrideSchema } from './dto/update-user-override.dto';
import { z } from 'zod';

const CreatePermissionSchema = z.object({
  code: z.string().min(3).max(100),
  description: z.string().min(3).max(255),
  module: z.string().min(1).max(50),
}).strict();

type CreatePermissionDto = z.infer<typeof CreatePermissionSchema>;

@Controller('permissions')
@Roles('SUPER_ADMIN')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // ═══ CRUD Permission ═══════════════════════════════════════════════════════

  @Get()
  @RequirePermission('permissions.read')
  async getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  @Post()
  @RequirePermission('permissions.manage')
  async createPermission(@Body(ZodPipe(CreatePermissionSchema)) dto: CreatePermissionDto) {
    const existing = await this.permissionsService.getPermissionByCode(dto.code);
    if (existing) throw new BadRequestException(`Permission '${dto.code}' sudah ada`);

    return this.permissionsService.createPermission(dto.code, dto.description, dto.module);
  }

  @Delete(':id')
  @RequirePermission('permissions.manage')
  async deletePermission(@Param('id') id: string) {
    return this.permissionsService.deletePermission(id);
  }

  // ═══ Role ↔ Permission ═════════════════════════════════════════════════════

  @Get('roles/:role')
  @RequirePermission('permissions.read')
  async getRolePermissions(@Param('role') role: string) {
    this.assertValidRole(role);
    return this.permissionsService.getRolePermissions(role as UserRole);
  }

  @Put('roles/:role')
  @RequirePermission('permissions.manage')
  async setRolePermissions(
    @Param('role') role: string,
    @Body(ZodPipe(UpdateRolePermissionsSchema)) dto: { permissionIds: string[] },
  ) {
    this.assertValidRole(role);
    await this.permissionsService.setRolePermissions(role as UserRole, dto.permissionIds);
    return { success: true, role, count: dto.permissionIds.length };
  }

  // ═══ User Override ═════════════════════════════════════════════════════════

  @Get('users/:userId')
  @RequirePermission('permissions.read')
  async getUserPermissions(@Param('userId') userId: string) {
    return this.permissionsService.getUserEffectivePermissions(userId);
  }

  @Post('users/:userId/grant')
  @RequirePermission('permissions.manage')
  async grantUserPermission(
    @Param('userId') userId: string,
    @Body(ZodPipe(UserPermissionOverrideSchema)) dto: { permissionId: string; grant: boolean },
  ) {
    return this.permissionsService.grantUserPermission(userId, dto.permissionId);
  }

  @Delete('users/:userId/revoke')
  @RequirePermission('permissions.manage')
  async revokeUserPermission(
    @Param('userId') userId: string,
    @Query() rawQuery: unknown,
  ) {
    const parsed = UserPermissionOverrideSchema.pick({ permissionId: true }).safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);

    return this.permissionsService.revokeUserPermission(userId, parsed.data.permissionId);
  }

  // ═══ Helper ════════════════════════════════════════════════════════════════

  private assertValidRole(role: string): void {
    const validRoles = [
      'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA',
      'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI',
    ];
    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Role '${role}' tidak valid`);
    }
  }
}
