import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body DTO for the public newsletter unsubscribe endpoint. Email normalized to
 * match the stored canonical form.
 */
export class UnsubscribeDto {
  @ApiProperty({ description: 'Subscriber email address', example: 'user@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;
}
