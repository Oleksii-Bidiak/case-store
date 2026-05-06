import { UserRole } from '@prisma/client';

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
  id!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  phone!: string | null;
  role!: UserRole;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  /**
   * Create a UserEntity from a Prisma User model.
   * Strips out sensitive fields (passwordHash, refreshTokens)
   * and relation fields (cart, orders, addresses, reviews).
   */
  static fromPrisma(user: {
    id: string;
    email: string;
    passwordHash: string;
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
