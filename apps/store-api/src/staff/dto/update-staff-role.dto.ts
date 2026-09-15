import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Body of `PATCH /api/admin/staff/:id/role` (TASK-317/334, moved here in
 * TASK-476).
 *
 * All three roles are accepted, and each one is a real flow:
 *   - CUSTOMER — demoting a departing employee, which is strictly safer than
 *     deletion because their order history stays attached to a live row;
 *   - MANAGER  — the promotion path for an existing shopper, which is why this
 *     route accepts a CUSTOMER target while the rest of the staff surface 404s
 *     on one (`docs/reviews/2026-09-11-access-model.md` §5);
 *   - ADMIN    — appointing a deputy, which only the owner may do.
 *
 * There is no OWNER value to accept: ownership is a flag rather than a role, so
 * no request body can ask for it. It moves by transfer only (TASK-478).
 *
 * Who may pick which of the three is `assertMayAssign`'s answer, not this DTO's —
 * see {@link CreateStaffDto} for why the level rule is not expressed in a
 * validator.
 */
export class UpdateStaffRoleDto {
  @ApiProperty({
    description: 'New role for the account',
    enum: UserRole,
    example: UserRole.MANAGER,
  })
  @IsEnum(UserRole, { message: 'Role must be one of: CUSTOMER, ADMIN, MANAGER' })
  role!: UserRole;
}
