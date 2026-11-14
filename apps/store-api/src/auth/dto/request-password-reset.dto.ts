import { IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/validators';

export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'Email address of the account to send a password-reset link to',
    example: 'user@example.com',
    maxLength: 254,
  })
  @Transform(normalizeEmail) // TASK-772
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // TASK-1984: the cap every stored address has (RegisterDto) — one email rule
  // on both ends (forms Rule 5c).
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  email!: string;
}
