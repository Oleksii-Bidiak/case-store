import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongAppPassword, PASSWORD_POLICY_DESCRIPTION } from '../../common/validators';

/**
 * Body of `POST /api/auth/password/change` (TASK-333).
 *
 * `currentPassword` is validated only as "present" — never with
 * {@link IsStrongAppPassword}. The current password is whatever the account
 * already has, which may predate the policy; rejecting it at the DTO would turn
 * "your old password is weak" into "you can never change it", which is exactly
 * backwards.
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
    description: `New account password (${PASSWORD_POLICY_DESCRIPTION})`,
    example: 'StrongP@ss123',
    minLength: 8,
  })
  @IsStrongAppPassword()
  newPassword!: string;
}
