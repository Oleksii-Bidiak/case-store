import { ApiProperty } from '@nestjs/swagger';
import { IsStaffPassword, STAFF_PASSWORD_DESCRIPTION } from '../../common/validators';

/**
 * Body of `POST /api/admin/staff/:id/password` — resetting SOMEONE ELSE's
 * password (TASK-333, moved off `/api/users` in TASK-476).
 *
 * Deliberately does NOT take the caller's own password: they are already proven
 * by their session, and asking for the target's current password would make the
 * endpoint useless for its one purpose (an employee who forgot theirs).
 *
 * The blast radius is contained by the LEVEL rule rather than by a second factor:
 * setting a password is signing in as that person, so `assertMayManage` refuses
 * it against anyone at or above the caller's level — an admin can rescue a
 * manager, nobody can reach another admin, and nobody at all can reach the owner.
 * Every reset also revokes the target's sessions and lands in the audit log.
 */
export class SetStaffPasswordDto {
  @ApiProperty({
    description: `New password for the target account (${STAFF_PASSWORD_DESCRIPTION})`,
    example: 'StrongP@ss123',
    minLength: 8,
  })
  @IsStaffPassword()
  newPassword!: string;
}
