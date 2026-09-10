import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CUSTOMER_PASSWORD_DESCRIPTION, IsCustomerPassword } from '../../common/validators';

/**
 * Body of `POST /api/auth/password/reset/confirm`.
 *
 * Validated against the CUSTOMER policy (TASK-407) because the DTO cannot tell
 * whose account this is — a reset token is opaque here, and the flow is open to
 * staff as well as shoppers. `AuthService.confirmPasswordReset` re-checks the
 * strict rule once the token has been resolved to a user, exactly as
 * `changePassword` does; without that second check "staff keep the strict
 * policy" would have been one «Забули пароль?» away from untrue.
 */
export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: 'The single-use password-reset token from the emailed link',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token!: string;

  @ApiProperty({
    description: `New account password (${CUSTOMER_PASSWORD_DESCRIPTION}; staff accounts additionally require an uppercase letter)`,
    example: 'strongp@ss123',
    minLength: 8,
  })
  @IsCustomerPassword()
  newPassword!: string;
}
