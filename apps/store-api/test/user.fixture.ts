import { UserRole, type User } from '@prisma/client';

/**
 * A complete Prisma `User` row for specs (TASK-791).
 *
 * Specs used to spell user rows as bare literals, and each new column on the
 * model silently left them incomplete — invisible while specs were never
 * type-checked. Every field the model has gets a neutral default here (no
 * tombstone, unverified, no second factor, not the owner); a spec passes only
 * the fields its scenario is about.
 */
export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    firstName: 'John',
    lastName: 'Doe',
    phone: null,
    role: UserRole.CUSTOMER,
    isActive: true,
    originalEmail: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    failedLoginAttempts: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    totpSecret: null,
    totpEnabledAt: null,
    isOwner: false,
    ...overrides,
  };
}
