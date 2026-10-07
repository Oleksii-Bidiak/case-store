import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { PickupPointService } from './pickup-point.service';
import {
  AdminPickupPointDto,
  AdminPickupPointListResponse,
  AdminPickupPointResponse,
  CreatePickupPointDto,
  DeletePickupPointResponse,
  ReorderPickupPointsDto,
  UpdatePickupPointDto,
} from './dto';

/**
 * Admin CRUD for the shop's pickup points (TASK-645, plan 184).
 *
 *   GET    /api/admin/pickup-points          — every point, inactive included
 *   PATCH  /api/admin/pickup-points/reorder  — rewrite the complete ordering
 *   POST   /api/admin/pickup-points          — create (appended to the end)
 *   PUT    /api/admin/pickup-points/:id      — partial update (incl. isActive)
 *   DELETE /api/admin/pickup-points/:id      — hard delete
 *
 * Same class-level guard as `AdminDeliveryController`: the points are part of
 * the delivery settings, so `settings:delivery` is the one key, and a route
 * added later cannot forget it. Every route is permission-guarded, so the
 * global `AuditInterceptor` records the mutating ones.
 *
 * Deactivation (`PUT {isActive:false}`) is the operator's usual move for a point
 * that closed — orders reference it. Delete is allowed and safe (the FK is
 * SetNull; each order keeps a snapshot of the point's name and address), but in
 * the UI it is the secondary action.
 */
@ApiTags('Delivery')
@ApiExtraModels(
  AdminPickupPointDto,
  AdminPickupPointListResponse,
  AdminPickupPointResponse,
  DeletePickupPointResponse,
)
@Controller('admin/pickup-points')
@UseGuards(PermissionGuard)
@RequirePermission('settings:delivery')
export class AdminPickupPointsController {
  constructor(private readonly pickupPoints: PickupPointService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List every pickup point, inactive included (admin)',
    operationId: 'listAdminPickupPoints',
  })
  @ApiResponse({
    status: 200,
    description: 'All points in display order, with the number of orders referencing each',
    type: AdminPickupPointListResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:delivery required' })
  async list(): Promise<AdminPickupPointListResponse> {
    return { data: await this.pickupPoints.listAdmin() };
  }

  /**
   * DECLARED BEFORE the `:id` routes — otherwise `reorder` would be captured as
   * an id (only PUT/DELETE take `:id` today, but the order is the contract).
   */
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reorder the pickup points (admin)',
    operationId: 'reorderPickupPoints',
  })
  @ApiResponse({
    status: 200,
    description: 'The full refreshed list (same envelope as the list)',
    type: AdminPickupPointListResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error, or REORDER_DUPLICATE_ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:delivery required' })
  @ApiResponse({ status: 404, description: 'REORDER_NOT_FOUND — an id is not a pickup point' })
  @ApiResponse({ status: 409, description: 'REORDER_STALE — the list changed since it was read' })
  async reorder(@Body() dto: ReorderPickupPointsDto): Promise<AdminPickupPointListResponse> {
    return { data: await this.pickupPoints.reorder(dto) };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a pickup point, appended to the end of the list (admin)',
    operationId: 'createPickupPoint',
  })
  @ApiResponse({ status: 201, description: 'Point created', type: AdminPickupPointResponse })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:delivery required' })
  async create(@Body() dto: CreatePickupPointDto): Promise<AdminPickupPointResponse> {
    return { data: await this.pickupPoints.create(dto) };
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update a pickup point; only the fields sent are written (admin)',
    operationId: 'updatePickupPoint',
  })
  @ApiParam({ name: 'id', description: 'Pickup point UUID' })
  @ApiResponse({ status: 200, description: 'Point updated', type: AdminPickupPointResponse })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:delivery required' })
  @ApiResponse({ status: 404, description: 'Pickup point not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePickupPointDto,
  ): Promise<AdminPickupPointResponse> {
    return { data: await this.pickupPoints.update(id, dto) };
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete a pickup point; its orders keep their snapshot (admin)',
    operationId: 'deletePickupPoint',
  })
  @ApiParam({ name: 'id', description: 'Pickup point UUID' })
  @ApiResponse({ status: 200, description: 'Point deleted', type: DeletePickupPointResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:delivery required' })
  @ApiResponse({ status: 404, description: 'Pickup point not found' })
  async remove(@Param('id') id: string): Promise<DeletePickupPointResponse> {
    return { data: await this.pickupPoints.remove(id) };
  }
}
