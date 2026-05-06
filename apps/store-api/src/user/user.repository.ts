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
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Find a user by email address.
   * Returns the user record or null if not found.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
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

    // Build the where clause from optional filters
    const where: Prisma.UserWhereInput = {};

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
        orderBy: { createdAt: 'desc' },
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
}
