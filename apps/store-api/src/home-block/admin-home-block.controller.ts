import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { HomeBlockService } from './home-block.service';
import { CreateHomeBlockDto, ReorderHomeBlocksDto, UpdateHomeBlockDto } from './dto';
import { HomeBlockCarouselSummaryEntity, HomeBlockEntity, HomeBlockTabEntity } from './entities';

/** Response envelope for the admin block list. */
class AdminHomeBlockListResponse {
  @ApiProperty({
    type: [HomeBlockEntity],
    description: 'Every block of every status, in page order',
  })
  data!: HomeBlockEntity[];
}

/** Response envelope for one block. */
class AdminHomeBlockResponse {
  @ApiProperty({ type: HomeBlockEntity })
  data!: HomeBlockEntity;
}

/**
 * The «Головна» admin screen's API (TASK-661). Reads take `home:read` or `home:write`,
 * every write takes `home:write`.
 *
 *   GET    /api/admin/home-blocks              — every block, page order, with flags
 *   PATCH  /api/admin/home-blocks/reorder      — rewrite the page order
 *   GET    /api/admin/home-blocks/:id          — one block
 *   POST   /api/admin/home-blocks              — add a CAROUSEL or TABS block
 *   PUT    /api/admin/home-blocks/:id          — edit title / carousel / tabs / publish state
 *   PATCH  /api/admin/home-blocks/:id/publish  — show now
 *   PATCH  /api/admin/home-blocks/:id/unpublish — hide (draft)
 *   DELETE /api/admin/home-blocks/:id          — remove a CAROUSEL / TABS block (409 for a singleton)
 */
@ApiTags('Home blocks')
@ApiExtraModels(
  HomeBlockEntity,
  HomeBlockTabEntity,
  HomeBlockCarouselSummaryEntity,
  AdminHomeBlockListResponse,
  AdminHomeBlockResponse,
)
@Controller('admin/home-blocks')
@UseGuards(PermissionGuard)
@RequirePermission('home:write')
export class AdminHomeBlockController {
  constructor(private readonly homeBlockService: HomeBlockService) {}

  @Get()
  @RequireAnyPermission('home:read', 'home:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List every homepage block in page order (admin)' })
  @ApiResponse({ status: 200, type: AdminHomeBlockListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:read or home:write' })
  async findAll(): Promise<AdminHomeBlockListResponse> {
    return { data: await this.homeBlockService.findAllAdmin() };
  }

  /** DECLARED BEFORE the `:id` routes — otherwise `reorder` is captured as an `:id`. */
  @Patch('reorder')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Rewrite the homepage block order (admin)',
    operationId: 'adminHomeBlockControllerReorder',
  })
  @ApiResponse({ status: 200, type: AdminHomeBlockListResponse })
  @ApiResponse({ status: 400, description: 'Validation error or REORDER_DUPLICATE_ID' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:write' })
  @ApiResponse({ status: 404, description: 'REORDER_NOT_FOUND — an id is not a block' })
  @ApiResponse({ status: 409, description: 'REORDER_STALE — the page changed since it was loaded' })
  async reorder(@Body() dto: ReorderHomeBlocksDto): Promise<AdminHomeBlockListResponse> {
    return { data: await this.homeBlockService.reorder(dto) };
  }

  @Get(':id')
  @RequireAnyPermission('home:read', 'home:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get one homepage block (admin)' })
  @ApiParam({ name: 'id', description: 'Block UUID' })
  @ApiResponse({ status: 200, type: AdminHomeBlockResponse })
  @ApiResponse({ status: 404, description: 'Block not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:read or home:write' })
  async findById(@Param('id') id: string): Promise<AdminHomeBlockResponse> {
    return { data: await this.homeBlockService.findByIdAdmin(id) };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Add a CAROUSEL or TABS block to the homepage (admin)' })
  @ApiResponse({ status: 201, type: AdminHomeBlockResponse })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. a field of the other type)' })
  @ApiResponse({ status: 404, description: 'A named carousel does not exist' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:write' })
  async create(@Body() dto: CreateHomeBlockDto): Promise<AdminHomeBlockResponse> {
    return { data: await this.homeBlockService.create(dto) };
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Edit a homepage block (admin)' })
  @ApiParam({ name: 'id', description: 'Block UUID' })
  @ApiResponse({ status: 200, type: AdminHomeBlockResponse })
  @ApiResponse({
    status: 400,
    description: 'Invalid input, or HOME_BLOCK_FIELD_NOT_ALLOWED for a field of another type',
  })
  @ApiResponse({ status: 404, description: 'Block (or a named carousel) not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:write' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHomeBlockDto,
  ): Promise<AdminHomeBlockResponse> {
    return { data: await this.homeBlockService.update(id, dto) };
  }

  @Patch(':id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Show a homepage block now (admin)' })
  @ApiParam({ name: 'id', description: 'Block UUID' })
  @ApiResponse({ status: 200, type: AdminHomeBlockResponse })
  @ApiResponse({ status: 404, description: 'Block not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:write' })
  async publish(@Param('id') id: string): Promise<AdminHomeBlockResponse> {
    return { data: await this.homeBlockService.publish(id) };
  }

  @Patch(':id/unpublish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Hide a homepage block (back to draft) (admin)' })
  @ApiParam({ name: 'id', description: 'Block UUID' })
  @ApiResponse({ status: 200, type: AdminHomeBlockResponse })
  @ApiResponse({ status: 404, description: 'Block not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:write' })
  async unpublish(@Param('id') id: string): Promise<AdminHomeBlockResponse> {
    return { data: await this.homeBlockService.unpublish(id) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove a CAROUSEL or TABS block from the homepage (admin)' })
  @ApiParam({ name: 'id', description: 'Block UUID' })
  @ApiResponse({ status: 204, description: 'Removed (its carousels stay in «Каруселі»)' })
  @ApiResponse({ status: 404, description: 'Block not found' })
  @ApiResponse({
    status: 409,
    description: 'HOME_BLOCK_SYSTEM — a singleton block cannot be removed',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — needs home:write' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.homeBlockService.delete(id);
  }
}
