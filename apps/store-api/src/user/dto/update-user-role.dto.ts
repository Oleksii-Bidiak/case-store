import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Body of `PATCH /api/users/:id/role` — owner-only role change (TASK-317/334).
 *
 * All three roles are accepted here (unlike {@link CreateUserDto}): demoting a
 * departing employee back to CUSTOMER is the whole point, and it is strictly
 * safer than deletion because their order history stays attached to a live row.
 * The "last admin" guard in UserService is what stops this from being a way to
 * lock the owner out of their own shop.
 */
export class UpdateUserRoleDto {
  @ApiProperty({
    description: 'New role for the account',
    enum: UserRole,
    example: UserRole.MANAGER,
  })
  @IsEnum(UserRole, { message: 'Role must be one of: CUSTOMER, ADMIN, MANAGER' })
  role!: UserRole;
}
