import { IsEmail, IsString, MaxLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  CUSTOMER_PASSWORD_DESCRIPTION,
  IsCustomerPassword,
  normalizeEmail,
} from '../../common/validators';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    maxLength: 254,
  })
  // TASK-772: one address, one account — stored trimmed and lowercased.
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  email!: string;

  @ApiProperty({
    description: `User password (${CUSTOMER_PASSWORD_DESCRIPTION})`,
    example: 'strongp@ss123',
    minLength: 8,
  })
  @IsCustomerPassword()
  password!: string;

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
}
