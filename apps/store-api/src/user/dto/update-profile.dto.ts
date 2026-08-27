import { IsOptional, IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating the authenticated user's profile.
 *
 * Changeable fields: firstName, lastName, phone. Role and isActive are
 * admin-only operations and have no field here.
 *
 * `email` is still accepted, but only as a repeat of the address the account
 * already has — a client that echoes the whole profile back keeps working,
 * while an actual change is refused by `UserService.updateProfile` (TASK-372).
 * The field is deliberately NOT removed: dropping it would make the global
 * `forbidNonWhitelisted` pipe answer a bare "property email should not exist",
 * which tells an API consumer nothing about where address changes DO live.
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
