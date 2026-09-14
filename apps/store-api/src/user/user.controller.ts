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
  ApiQuery,
  ApiExtraModels,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import {
  CurrentActor,
  PermissionGuard,
  RequirePermission,
  OwnerOnly,
  type PermissionActor,
} from '../auth/permissions';
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

  // `POST /`, `POST /:id/password` and `PATCH /:id/role` used to be here.
  //
  // TASK-476 moved all three to `/api/admin/staff`, where the level rule decides
  // who may reach whom. They were `@OwnerOnly()`, which made them safe and also
  // made a deputy admin useless: the owner had to be at their desk for a manager
  // to be hired or rescued from a forgotten password. The three doors are now open
  // to an admin over managers and shut to everybody over admins and the owner.

  /**
   * GET /api/users/:id
   *
   * A CUSTOMER by id. A service account answers 404 — it is read on
   * `/api/admin/staff/:id` under `staff:read`.
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
   * Switch a CUSTOMER account off. Still `customers:write` — the same operator who
   * answers the phone deals with an abusive shopper — but a staff id answers 404
   * now. Until TASK-476 this route was the widest hole in the access model: a
   * manager holding `customers:write` could deactivate an administrator, and the
   * only thing between them and the owner was a count of remaining admins.
   */
  @Patch(':id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate a customer' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Customer deactivated',
    type: UserResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'No customer with this id' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — admin access required, or cannot deactivate your own account',
  })
  async deactivateUser(
    @Param('id') id: string,
    @CurrentActor() actor: PermissionActor,
  ): Promise<UserResponse> {
    const user = await this.userService.deactivateUser(id, actor);

    return { data: user };
  }

  /**
   * PATCH /api/users/:id/activate
   *
   * The mirror of deactivation, and customer-scoped for the same reason: an
   * account switched off on this surface is switched back on here.
   */
  @Patch(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('customers:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activate a customer' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Customer activated',
    type: UserResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'No customer with this id' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async activateUser(
    @Param('id') id: string,
    @CurrentActor() actor: PermissionActor,
  ): Promise<UserResponse> {
    const user = await this.userService.activateUser(id, actor);

    return { data: user };
  }

  /**
   * DELETE /api/users/:id
   *
   * Soft-deletes a CUSTOMER account (stamps `deletedAt`, hides it from all reads,
   * mangles the email to free it for re-registration, and revokes all sessions).
   * Returns 204 No Content.
   *
   * KEEPS `@OwnerOnly()` DELIBERATELY. Every other door in this task got WIDER —
   * an admin may now do to a manager what only the owner could do before — and
   * this one did not, because nothing in plan 181 asked for it. Deleting a
   * customer erases a person's record; the narrow rule costs an owner one click
   * and is not the bottleneck the staff routes were.
   */
  @Delete(':id')
  @UseGuards(PermissionGuard)
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete a customer (owner-only, soft-delete)',
    operationId: 'deleteUser',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 204, description: 'Customer deleted' })
  @ApiResponse({ status: 404, description: 'No customer with this id' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — owner-only, or cannot delete your own account',
  })
  async remove(@Param('id') id: string, @CurrentActor() actor: PermissionActor): Promise<void> {
    await this.userService.deleteUser(id, actor);
  }
}
