import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UserRepository, UpdateUserInput, FindAllParams } from './user.repository';
import { UserEntity } from './entities';
import { UpdateProfileDto, UserListQueryDto } from './dto';

/**
 * Pagination metadata returned alongside paginated results.
 */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Paginated response envelope for user lists.
 */
interface PaginatedUsersResponse {
  data: UserEntity[];
  meta: PaginationMeta;
}

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Get the profile of the authenticated user.
   * Returns a UserEntity with sensitive fields stripped.
   * Throws NotFoundException if the user does not exist.
   */
  async getProfile(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return UserEntity.fromPrisma(user);
  }

  /**
   * Update the profile of the authenticated user.
   * Only allows updating safe fields (email, firstName, lastName, phone).
   * Validates email uniqueness if the email is being changed.
   * Throws NotFoundException if the user does not exist.
   * Throws ConflictException if the new email is already taken by another user.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserEntity> {
    // Verify the user exists
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If email is being changed, check uniqueness
    if (dto.email !== undefined && dto.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(dto.email);

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email is already taken');
      }
    }

    // Build update input from DTO — only include provided fields
    const updateInput: UpdateUserInput = {};

    if (dto.email !== undefined) {
      updateInput.email = dto.email;
    }
    if (dto.firstName !== undefined) {
      updateInput.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      updateInput.lastName = dto.lastName;
    }
    if (dto.phone !== undefined) {
      updateInput.phone = dto.phone;
    }

    const updatedUser = await this.userRepository.update(userId, updateInput);

    return UserEntity.fromPrisma(updatedUser);
  }

  /**
   * Get a paginated list of users (admin-only).
   * Supports filtering by role, active status, and text search.
   * Returns a paginated response with metadata.
   */
  async findAll(query: UserListQueryDto): Promise<PaginatedUsersResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      role: query.role,
      isActive: query.isActive,
      search: query.search,
    };

    const { users, total } = await this.userRepository.findAll(params);

    const totalPages = Math.ceil(total / params.limit);

    return {
      data: users.map((user) => UserEntity.fromPrisma(user)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }

  /**
   * Get a user by ID (admin-only).
   * Returns a UserEntity with sensitive fields stripped.
   * Throws NotFoundException if the user does not exist.
   */
  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return UserEntity.fromPrisma(user);
  }

  /**
   * Deactivate a user by setting isActive = false (admin-only).
   * Throws NotFoundException if the user does not exist.
   */
  async deactivateUser(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const deactivatedUser = await this.userRepository.deactivate(id);

    return UserEntity.fromPrisma(deactivatedUser);
  }

  /**
   * Activate a user by setting isActive = true (admin-only).
   * Throws NotFoundException if the user does not exist.
   */
  async activateUser(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activatedUser = await this.userRepository.activate(id);

    return UserEntity.fromPrisma(activatedUser);
  }
}
