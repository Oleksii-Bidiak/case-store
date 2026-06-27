import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { User, UserRole, Prisma } from '@prisma/client';

/**
 * Parameters for paginated user queries.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Allowed fields for updating a user profile.
 * Only safe fields are included — role and isActive are excluded
 * because they require admin-level operations.
 */
export interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Result of a paginated user query.
 */
export interface PaginatedUsersResult {
  users: User[];
  total: number;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by ID.
   * Returns the user record or null if not found.
   *
   * Excludes soft-deleted users (`deletedAt IS NOT NULL`). `findFirst` is used
   * instead of `findUnique` because `deletedAt: null` is not part of a unique
   * index.
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * Find a user by email address.
   * Returns the user record or null if not found. Excludes soft-deleted users
   * (their email is mangled on delete, but the guard is explicit for safety).
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  /**
   * Find all users with pagination and optional filtering.
   * Supports filtering by role, active status, and text search
   * across email, firstName, and lastName fields.
   *
   * Returns the paginated user list and total count for pagination metadata.
   */
  async findAll(params: FindAllParams): Promise<PaginatedUsersResult> {
    const { page, limit, role, isActive, search } = params;
    const skip = (page - 1) * limit;

    // Allow-listed sort (TASK-147). The DTO `@IsIn` rejects unknown fields at
    // the API boundary; this fallback is a defensive default.
    const ALLOWED_SORT: Record<string, string> = {
      createdAt: 'createdAt',
      email: 'email',
    };
    const sortField = ALLOWED_SORT[params.sortBy ?? 'createdAt'] ?? 'createdAt';
    const sortOrder = params.sortOrder ?? 'desc';

    // Build the where clause from optional filters. Soft-deleted users
    // (tombstoned) must never appear in any admin listing.
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (role !== undefined) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Update a user's profile fields.
   * Only the fields provided in the data object will be updated.
   * Returns the updated user record.
   */
  update(id: string, data: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Deactivate a user by setting isActive = false.
   * Returns the updated user record.
   */
  deactivate(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Activate a user by setting isActive = true.
   * Returns the updated user record.
   */
  activate(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Soft-delete a user (TASK-104): stamp `deletedAt`, set `isActive = false`,
   * mangle the unique `email` to free the address for re-registration, and
   * preserve the original in `originalEmail` for audit. The row is kept so the
   * user's historical orders still resolve.
   *
   * The caller (service) builds `mangledEmail` and supplies the `originalEmail`.
   */
  softDelete(id: string, mangledEmail: string, originalEmail: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        email: mangledEmail,
        originalEmail,
      },
    });
  }
}
