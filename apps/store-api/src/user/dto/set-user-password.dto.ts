import { ApiProperty } from '@nestjs/swagger';
import { IsStaffPassword, STAFF_PASSWORD_DESCRIPTION } from '../../common/validators';

/**
 * Body of `POST /api/users/:id/password` — owner-only reset of SOMEONE ELSE's
 * password (TASK-333).
 *
 * Deliberately does NOT take the caller's own password: the owner is already
 * proven by their session, and asking for the target's current password would
 * make the endpoint useless for its one purpose (an employee who forgot theirs).
 * The blast radius is contained instead by `@OwnerOnly()` plus the fact that
 * every reset revokes the target's sessions and is written to the audit log.
 *
 * Keeps the STRICT policy (TASK-407). This is an admin-panel action typed by the
 * owner, so the looser shopper rule would buy nothing here — nobody is being
 * rescued from an abandoned form — while the account on the other end may well
 * be staff.
 */
export class SetUserPasswordDto {
  @ApiProperty({
    description: `New password for the target account (${STAFF_PASSWORD_DESCRIPTION})`,
    example: 'StrongP@ss123',
    minLength: 8,
  })
  @IsStaffPassword()
  newPassword!: string;
}
