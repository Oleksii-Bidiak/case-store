import { Controller, Get, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Roles } from '../auth/decorators';
import { UserEntity } from './entities';

/**
 * Response envelope for a single user.
 */
class UserResponseEnvelope {
  data!: UserEntity;
}

/**
 * Pagination metadata.
 */
class PaginationMeta {
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
}

/**
 * Response envelope for a paginated user list.
 */
class UserListResponseEnvelope {
  data!: UserEntity[];
  meta!: PaginationMeta;
}

/**
 * Type aliases for controller return types.
 */
type UserResponse = { data: UserEntity };
type UserListResponse = { data: UserEntity[]; meta: PaginationMeta };

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
@ApiTags('Users')
@ApiExtraModels(UserEntity, UserResponseEnvelope, UserListResponseEnvelope)
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved',
    schema: {
      allOf: [
        { $ref: getSchemaPath(UserResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(UserEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    schema: {
      allOf: [
        { $ref: getSchemaPath(UserResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(UserEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all users (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
    type: UserListResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get user by ID (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    schema: {
      allOf: [
        { $ref: getSchemaPath(UserResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(UserEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate user (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User deactivated',
    schema: {
      allOf: [
        { $ref: getSchemaPath(UserResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(UserEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activate user (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User activated',
    schema: {
      allOf: [
        { $ref: getSchemaPath(UserResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(UserEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async activateUser(@Param('id') id: string): Promise<UserResponse> {
    const user = await this.userService.activateUser(id);

    return { data: user };
  }
}
