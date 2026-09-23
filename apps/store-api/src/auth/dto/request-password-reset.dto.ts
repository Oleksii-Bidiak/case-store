import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/validators';

export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'Email address of the account to send a password-reset link to',
    example: 'user@example.com',
  })
  @Transform(normalizeEmail) // TASK-772
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}
