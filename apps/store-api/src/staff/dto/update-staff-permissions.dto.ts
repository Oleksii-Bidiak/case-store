import { IsArray, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of `PUT /api/admin/staff/:id/permissions` (TASK-477, plan 181).
 *
 * A REPLACE rather than add/remove deltas, and the verb is chosen to match: the
 * owner's screen is a grid of checkboxes, so "here is the ticked set" is the
 * operation they actually performed. It is also idempotent — submitting the same
 * grid twice cannot mean something different from submitting it once — which
 * matters on a screen somebody may double-click.
 *
 * NO `@ArrayUnique()`, on purpose. A duplicate key is not an error an operator
 * can act on; it is a client that sent the same box twice, and the correct
 * response is to grant it once. `assertGrantablePermissions` de-duplicates.
 *
 * WHICH keys are acceptable is deliberately NOT expressed here. The catalogue is
 * a runtime value, so an `@IsIn(...)` would duplicate it and then drift; worse,
 * it would put half the rule where the service's own validation cannot be seen,
 * and the OTHER writer of these keys — a permission template — does not go
 * through this DTO at all. One function, both call sites
 * (`grantable-permissions.ts`).
 */
export class UpdateStaffPermissionsDto {
  @ApiProperty({
    description:
      'The complete set of permission keys this person should hold. An empty array revokes ' +
      'everything. Non-grantable keys (staff:read, staff:write, audit:read) are refused with 400.',
    type: [String],
    example: ['orders:read', 'orders:write'],
  })
  @IsArray({ message: 'permissions must be an array of permission keys' })
  @IsString({ each: true, message: 'Each permission must be a string key' })
  @MaxLength(100, { each: true, message: 'Permission keys are at most 100 characters' })
  permissions!: string[];
}
