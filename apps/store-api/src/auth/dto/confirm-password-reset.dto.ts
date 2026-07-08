import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongAppPassword, PASSWORD_POLICY_DESCRIPTION } from '../../common/validators';

export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: 'The single-use password-reset token from the emailed link',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token!: string;

  @ApiProperty({
    description: `New account password (${PASSWORD_POLICY_DESCRIPTION})`,
    example: 'StrongP@ss123',
    minLength: 8,
  })
  @IsStrongAppPassword()
  newPassword!: string;
}
