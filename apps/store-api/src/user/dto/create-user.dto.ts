import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsStrongAppPassword, PASSWORD_POLICY_DESCRIPTION } from '../../common/validators';

/**
 * Body of `POST /api/users` — owner-only staff provisioning (TASK-333/317).
 *
 * The role is restricted to ADMIN | MANAGER on purpose. This endpoint exists so
 * hiring someone stops requiring a developer with shell access
 * (`scripts/create-admin.ts`); creating CUSTOMER accounts is what registration
 * is for, and offering it here would just be a way to mint an account whose
 * email nobody ever proved.
 */
export class CreateUserDto {
  @ApiProperty({ description: 'Email address (also the login)', example: 'manager@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    description: `Initial password (${PASSWORD_POLICY_DESCRIPTION})`,
    example: 'StrongP@ss123',
    minLength: 8,
  })
  @IsStrongAppPassword()
  password!: string;

  @ApiProperty({
    description: 'Staff role. CUSTOMER is rejected — use public registration for shoppers.',
    enum: [UserRole.ADMIN, UserRole.MANAGER],
    example: UserRole.MANAGER,
  })
  @IsEnum([UserRole.ADMIN, UserRole.MANAGER], {
    message: 'Role must be one of: ADMIN, MANAGER',
  })
  role!: typeof UserRole.ADMIN | typeof UserRole.MANAGER;

  @ApiProperty({ description: 'First name', example: 'Olena', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'First name must be at most 100 characters' })
  firstName?: string;

  @ApiProperty({ description: 'Last name', example: 'Kovalenko', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must be at most 100 characters' })
  lastName?: string;
}
