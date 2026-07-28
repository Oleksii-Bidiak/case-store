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

  // enum: UserRole, not a hand-written array. The literal list omitted MANAGER
  // after TASK-334 added it, so Orval generated a union without it and the admin
  // panel rendered a manager as «Клієнт» — a stale copy of an enum that already
  // knows its own members.
  @ApiProperty({ description: 'User role', example: 'CUSTOMER', enum: UserRole })
  role!: UserRole;

  @ApiProperty({ description: 'Whether the user account is active', example: true })
  isActive!: boolean;

  /**
   * When this address was proven (TASK-342); null when it never was.
   *
   * Exposed because the storefront could not otherwise know: it had to treat the
   * missing field as 'unknown' and stay silent rather than tell every long-verified
   * user to confirm an address they confirmed months ago.
   */
  @ApiProperty({
    description: 'When the email address was verified; null if never',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  emailVerifiedAt!: string | null;

  /**
   * Login lockout state (TASK-314), admin-facing.
   *
   * Without these the admin user card could not answer the one question an
   * operator actually has when someone cannot get in — is the password wrong, or
   * is the account temporarily locked?
   */
  @ApiProperty({
    description: 'Locked out until this instant; null when not locked',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lockedUntil!: string | null;

  @ApiProperty({ description: 'Consecutive failed login attempts', example: 0 })
  failedLoginAttempts!: number;

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
    emailVerifiedAt?: Date | null;
    lockedUntil?: Date | null;
    failedLoginAttempts?: number;
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
    entity.emailVerifiedAt = user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null;
    entity.lockedUntil = user.lockedUntil ? user.lockedUntil.toISOString() : null;
    entity.failedLoginAttempts = user.failedLoginAttempts ?? 0;
    entity.createdAt = user.createdAt;
    entity.updatedAt = user.updatedAt;
    return entity;
  }
}
