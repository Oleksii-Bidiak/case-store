import { ArrayUnique, IsArray, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Body of `PUT /api/admin/permissions` (TASK-334).
 *
 * The whole grant set for ONE role, replacing whatever was there. A "replace"
 * shape rather than add/remove deltas because the owner's screen is a grid of
 * checkboxes: sending the ticked set is the operation they actually performed,
 * and it cannot be applied twice to different effect.
 *
 * `permissions` is validated as strings here and checked against the code
 * catalogue in {@link PermissionService.setRoleGrants} — the catalogue is a
 * runtime value, so a DTO-level `@IsIn` would duplicate it and then drift.
 */
export class UpdateRoleGrantsDto {
  @ApiProperty({
    description:
      'The role whose grants are being replaced. ADMIN is rejected — the owner always holds everything.',
    enum: [UserRole.MANAGER],
    example: UserRole.MANAGER,
  })
  @IsEnum(UserRole, { message: 'Role must be a valid user role' })
  role!: UserRole;

  @ApiProperty({
    description:
      'The complete set of permission keys this role should hold. An empty array revokes everything.',
    type: [String],
    example: ['orders:read', 'products:write'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  permissions!: string[];
}
