import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of `PATCH /api/admin/staff/:id/status` (TASK-476).
 *
 * ONE ROUTE FOR BOTH DIRECTIONS, unlike `/api/users/:id/activate|deactivate`
 * which are two. Switching a staff account off and back on is the same decision
 * about the same person, and the pair of routes is how the old surface ended up
 * with the level check on only one of them: `deactivate` had a self-targeting
 * guard and `activate` had nothing at all. A single route cannot drift from
 * itself.
 */
export class UpdateStaffStatusDto {
  @ApiProperty({
    description: 'true activates the account, false deactivates it',
    example: false,
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive!: boolean;
}
