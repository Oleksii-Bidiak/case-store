import { IsOptional, IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating the authenticated user's profile.
 *
 * Only allows updating safe fields — email, firstName, lastName, phone.
 * Role and isActive cannot be changed through this DTO (admin-only operations).
 */
export class UpdateProfileDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'First name must be at most 100 characters' })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must be at most 100 characters' })
  lastName?: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+380991234567',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Phone number must be at most 30 characters' })
  phone?: string;
}
