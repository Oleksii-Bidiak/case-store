import {
  Controller,
  Get,
  Post,
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
  ApiQuery,
  ApiExtraModels,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import {
  UpdateProfileDto,
  UserListQueryDto,
  CreateUserDto,
  SetUserPasswordDto,
  UpdateUserRoleDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { PermissionGuard, RequirePermission, OwnerOnly } from '../auth/permissions';
import { CurrentUser } from '../auth/decorators';
import {
  UserEntity,
  UserAdminCardEntity,
  CustomerCardOrderEntity,
  CustomerCardReviewEntity,
  CustomerCardCouponEntity,
  CustomerCardContactMessageEntity,
} from './entities';

/**
 * Response envelope for a single user.
 */
class UserResponseEnvelope {
  @ApiProperty({ type: UserEntity })
  data!: UserEntity;
}

/**
 * Response envelope for the enriched admin customer card (TASK-252).
 */
class UserAdminCardResponseEnvelope {
  @ApiProperty({ type: UserAdminCardEntity })
  data!: UserAdminCardEntity;
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
type UserAdminCardResponse = { data: UserAdminCardEntity };

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
@ApiExtraModels(
  UserEntity,
  UserResponseEnvelope,
  UserListResponseEnvelope,
  UserAdminCardEntity,
  UserAdminCardResponseEnvelope,
  CustomerCardOrderEntity,
  CustomerCardReviewEntity,
  CustomerCardCouponEntity,
  CustomerCardContactMessageEntity,
)
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
   * Only firstName, lastName and phone can be changed. Role and isActive are
   * admin operations; the email address is the login and the password-reset
   * channel, so changing it is refused here (TASK-372) — see UserService.
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
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all users (admin)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field: createdAt | email' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order: asc | desc' })
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
   * POST /api/users (TASK-333/317)
   *
   * Create an ADMIN or MANAGER account from the admin UI. Owner-only.
   *
   * Before this existed the only way to add staff was a developer running
   * `scripts/create-admin.ts` on the server — and that script only makes
   * ADMINs, so "hire someone to write the blog" meant handing over the orders,
   * the prices and every customer's personal data.
   */
  @Post()
  @UseGuards(PermissionGuard)
  @OwnerOnly()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a staff account (owner-only)', operationId: 'createUser' })
  @ApiResponse({ status: 201, description: 'Staff account created', type: UserResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input (weak password / bad role)' })
  @ApiResponse({ status: 403, description: 'Forbidden — owner-only' })
  @ApiResponse({ status: 409, description: 'Email is already taken' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    const user = await this.userService.createUser(dto);

    return { data: user };
  }

  /**
   * POST /api/users/:id/password (TASK-333)
   *
   * Reset someone else's password. Owner-only.
   *
   * The employee-forgot-their-password path. Revokes every session the target
   * held, exactly as a self-service change does — an owner resetting a password
   * because an account may be compromised must not leave the intruder signed in.
   */
  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionGuard)
  @OwnerOnly()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Reset another user's password (owner-only)",
    operationId: 'setUserPassword',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Password reset; target sessions revoked',
    type: UserResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input (weak password)' })
  @ApiResponse({ status: 403, description: 'Forbidden — owner-only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async setPassword(
    @Param('id') id: string,
    @Body() dto: SetUserPasswordDto,
  ): Promise<UserResponse> {
    const user = await this.userService.setUserPassword(id, dto.newPassword);

    return { data: user };
  }

  /**
   * PATCH /api/users/:id/role (TASK-317/334)
   *
   * Change a user's role. Owner-only, and refused when it would leave the shop
   * without a single administrator who can sign in.
   */
  @Patch(':id/role')
  @UseGuards(PermissionGuard)
  @OwnerOnly()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Change a user's role (owner-only)", operationId: 'updateUserRole' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Role updated; target sessions revoked',
    type: UserResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid role' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — owner-only, your own account, or the last active administrator',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('id') adminId: string,
  ): Promise<UserResponse> {
    const user = await this.userService.updateUserRole(id, dto.role, adminId);

    return { data: user };
  }

  /**
   * GET /api/users/:id
   *
   * Returns a specific user by ID.
   * Admin-only endpoint.
   */
  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:read')
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
   * GET /api/users/:id/admin-card
   *
   * Returns the enriched admin "customer card" (TASK-252): the user's profile
   * plus lifetime value, order count, recent orders, product reviews, redeemed
   * coupons, and contact-inbox messages matched by email. Admin-only.
   */
  @Get(':id/admin-card')
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get enriched customer card (LTV, orders, reviews, coupons, contact messages)',
    operationId: 'getUserAdminCard',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Customer card retrieved',
    type: UserAdminCardResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getAdminCard(@Param('id') id: string): Promise<UserAdminCardResponse> {
    const card = await this.userService.getAdminCard(id);

    return { data: card };
  }

  /**
   * PATCH /api/users/:id/deactivate
   *
   * Deactivates a user account (sets isActive = false).
   * Admin-only endpoint.
   */
  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:write')
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
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:write')
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
  @UseGuards(PermissionGuard)
  @OwnerOnly()
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
