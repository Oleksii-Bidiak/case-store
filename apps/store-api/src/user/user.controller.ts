import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { JwtAuthGuard, AdminGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { UserEntity } from './entities';

/**
 * Response envelope for a single user.
 */
class UserResponseEnvelope {
  @ApiProperty({ type: UserEntity })
  data!: UserEntity;
}

/**
 * Pagination metadata.
 */
class PaginationMeta {
  @ApiProperty({ type: Number, example: 100 })
  total!: number;

  @ApiProperty({ type: Number, example: 1 })
  page!: number;

  @ApiProperty({ type: Number, example: 20 })
  limit!: number;

  @ApiProperty({ type: Number, example: 5 })
  totalPages!: number;
}

/**
 * Response envelope for a paginated user list.
 */
class UserListResponseEnvelope {
  @ApiProperty({ type: [UserEntity] })
  data!: UserEntity[];

  @ApiProperty({ type: PaginationMeta })
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
    type: UserResponseEnvelope,
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
    type: UserResponseEnvelope,
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
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get user by ID (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseEnvelope,
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
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate user (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User deactivated',
    type: UserResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required, or cannot deactivate your own account',
  })
  async deactivateUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<UserResponse> {
    const user = await this.userService.deactivateUser(id, adminId);

    return { data: user };
  }

  /**
   * PATCH /api/users/:id/activate
   *
   * Activates a user account (sets isActive = true).
   * Admin-only endpoint.
   */
  @Patch(':id/activate')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activate user (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User activated',
    type: UserResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async activateUser(@Param('id') id: string): Promise<UserResponse> {
    const user = await this.userService.activateUser(id);

    return { data: user };
  }

  /**
   * DELETE /api/users/:id
   *
   * Soft-deletes a user account (sets `deletedAt`, hides it from all reads,
   * mangles the email to free it for re-registration, and revokes all sessions).
   * Admin-only; an admin cannot delete their own account. Returns 204 No Content.
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete user (admin, soft-delete)', operationId: 'deleteUser' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required, or cannot delete your own account',
  })
  async remove(@Param('id') id: string, @CurrentUser('id') adminId: string): Promise<void> {
    await this.userService.deleteUser(id, adminId);
  }
}
