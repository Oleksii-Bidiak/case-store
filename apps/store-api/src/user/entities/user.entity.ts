import { UserRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a user.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by UserService methods and contains only
 * the data that should be exposed to the client.
 *
 * Sensitive fields (passwordHash, refreshTokens) are EXCLUDED
 * to prevent accidental leakage in API responses.
 */
export class UserEntity {
  @ApiProperty({
    description: 'User unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  email!: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
    nullable: true,
    type: String,
  })
  firstName!: string | null;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
    nullable: true,
    type: String,
  })
  lastName!: string | null;

  @ApiProperty({
    description: 'User phone number',
    example: '+380991234567',
    required: false,
    nullable: true,
    type: String,
  })
  phone!: string | null;

  @ApiProperty({ description: 'User role', example: 'CUSTOMER', enum: ['CUSTOMER', 'ADMIN'] })
  role!: UserRole;

  @ApiProperty({ description: 'Whether the user account is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Account creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a UserEntity from a Prisma User model.
   * Strips out sensitive fields (passwordHash, refreshTokens)
   * and relation fields (cart, orders, addresses, reviews).
   */
  static fromPrisma(user: {
    id: string;
    email: string;
    // Nullable since TASK-168 — Google-only accounts have no password.
    passwordHash: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): UserEntity {
    const entity = new UserEntity();
    entity.id = user.id;
    entity.email = user.email;
    entity.firstName = user.firstName;
    entity.lastName = user.lastName;
    entity.phone = user.phone;
    entity.role = user.role;
    entity.isActive = user.isActive;
    entity.createdAt = user.createdAt;
    entity.updatedAt = user.updatedAt;
    return entity;
  }
}
