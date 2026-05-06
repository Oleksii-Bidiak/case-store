import { Controller, Get, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Roles } from '../auth/decorators';
import { UserEntity } from './entities';

/**
 * Response envelope for a single user.
 */
interface UserResponse {
  data: UserEntity;
}

/**
 * Response envelope for a paginated user list.
 */
interface UserListResponse {
  data: UserEntity[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Controller for user profile and admin user management endpoints.
 *
 * Profile endpoints (authenticated user):
 *   GET  /users/me          — Get current user's profile
 *   PUT  /users/me          — Update current user's profile
 *
 * Admin endpoints (ADMIN role required):
 *   GET    /users           — List all users (paginated, filterable)
 *   GET    /users/:id       — Get a specific user by ID
 *   PATCH  /users/:id/deactivate — Deactivate a user
 *   PATCH  /users/:id/activate   — Activate a user
 */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /api/users/me
   *
   * Returns the profile of the currently authenticated user.
   * Sensitive fields (passwordHash, refreshTokens) are excluded.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser('id') userId: string): Promise<UserResponse> {
    const user = await this.userService.getProfile(userId);

    return { data: user };
  }

  /**
   * PUT /api/users/me
   *
   * Updates the profile of the currently authenticated user.
   * Only safe fields (email, firstName, lastName, phone) can be updated.
   * Role and isActive cannot be changed through this endpoint.
   */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponse> {
    const user = await this.userService.updateProfile(userId, dto);

    return { data: user };
  }

  /**
   * GET /api/users
   *
   * Returns a paginated list of all users.
   * Supports filtering by role, active status, and text search.
   * Admin-only endpoint.
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findAll(@Query() query: UserListQueryDto): Promise<UserListResponse> {
    return this.userService.findAll(query);
  }

  /**
   * GET /api/users/:id
   *
   * Returns a specific user by ID.
   * Admin-only endpoint.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findById(@Param('id') id: string): Promise<UserResponse> {
    const user = await this.userService.findById(id);

    return { data: user };
  }

  /**
   * PATCH /api/users/:id/deactivate
   *
   * Deactivates a user account (sets isActive = false).
   * Admin-only endpoint.
   */
  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async deactivateUser(@Param('id') id: string): Promise<UserResponse> {
    const user = await this.userService.deactivateUser(id);

    return { data: user };
  }

  /**
   * PATCH /api/users/:id/activate
   *
   * Activates a user account (sets isActive = true).
   * Admin-only endpoint.
   */
  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async activateUser(@Param('id') id: string): Promise<UserResponse> {
    const user = await this.userService.activateUser(id);

    return { data: user };
  }
}
