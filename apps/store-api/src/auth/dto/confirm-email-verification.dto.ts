import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Body of `POST /api/auth/email/verify/confirm` (TASK-342). */
export class ConfirmEmailVerificationDto {
  @ApiProperty({
    description: 'The single-use verification token from the emailed link',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token!: string;
}
