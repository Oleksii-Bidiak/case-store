import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/validators';

/**
 * Body DTO for the public newsletter unsubscribe endpoint. Email normalized to
 * match the stored canonical form.
 */
export class UnsubscribeDto {
  @ApiProperty({ description: 'Subscriber email address', example: 'user@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;
}
