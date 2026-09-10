import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CUSTOMER_PASSWORD_DESCRIPTION, IsCustomerPassword } from '../../common/validators';

/**
 * Body of `POST /api/auth/password/change` (TASK-333).
 *
 * `currentPassword` is validated only as "present" — never with a strength
 * policy. The current password is whatever the account already has, which may
 * predate the policy; rejecting it at the DTO would turn "your old password is
 * weak" into "you can never change it", which is exactly backwards.
 *
 * ── Why `newPassword` takes the CUSTOMER policy (TASK-407) ────────────────────
 * This one endpoint serves the storefront `/account` screen AND the admin panel,
 * and the body says nothing about who is calling. So the DTO applies the rule
 * that must hold for everyone, and `AuthService.changePassword` adds the strict
 * one for an ADMIN/MANAGER once it has loaded the user. Validating strictly here
 * instead would lock every shopper out of the looser policy they were just
 * granted; validating loosely and stopping there would quietly downgrade staff.
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'The password currently on the account — proof the session is the owner',
    example: 'OldP@ssw0rd',
  })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;

  @ApiProperty({
    description: `New account password (${CUSTOMER_PASSWORD_DESCRIPTION}; staff accounts additionally require an uppercase letter)`,
    example: 'strongp@ss123',
    minLength: 8,
  })
  @IsCustomerPassword()
  newPassword!: string;
}
