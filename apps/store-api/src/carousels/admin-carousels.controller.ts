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
  HttpCode,
  UseGuards,
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
import { CarouselService } from './carousels.service';
import {
  CreateCarouselDto,
  UpdateCarouselDto,
  AdminCarouselListQueryDto,
  SetCarouselItemsDto,
} from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { CarouselEntity, CarouselItemEntity, CarouselItemProductEntity } from './entities';

/**
 * Response envelope for an admin carousel list (published + drafts).
 */
class AdminCarouselListResponse {
  @ApiProperty({
    type: [CarouselEntity],
    description: 'Carousels (all statuses, optionally filtered)',
  })
  data!: CarouselEntity[];
}

/**
 * Response envelope for a single carousel.
 */
class CarouselResponseEnvelope {
  @ApiProperty({ type: CarouselEntity })
  data!: CarouselEntity;
}

/**
 * Response envelope for a carousel's hand-picked item list.
 */
class CarouselItemListResponse {
  @ApiProperty({
    type: [CarouselItemEntity],
    description: 'Hand-picked items ordered by sort order, with product summaries',
  })
  data!: CarouselItemEntity[];
}

/**
 * Controller for admin carousel management (ADMIN role required).
 *
 *   GET    /api/admin/carousels                — list all carousels (all statuses,
 *                                                optional ?placement= / ?status=)
 *   GET    /api/admin/carousels/:id            — carousel by ID
 *   POST   /api/admin/carousels                — create
 *   PUT    /api/admin/carousels/:id            — full update
 *   PATCH  /api/admin/carousels/:id/publish    — set status = PUBLISHED
 *   PATCH  /api/admin/carousels/:id/unpublish  — set status = DRAFT
 *   DELETE /api/admin/carousels/:id            — hard delete (items cascade)
 *   GET    /api/admin/carousels/:id/items      — hand-picked items (MANUAL)
 *   PUT    /api/admin/carousels/:id/items      — full-replace hand-picked items
 */
@ApiTags('Carousels')
@ApiExtraModels(
  AdminCarouselListResponse,
  CarouselEntity,
  CarouselResponseEnvelope,
  CarouselItemEntity,
  CarouselItemProductEntity,
  CarouselItemListResponse,
)
@Controller('admin/carousels')
@UseGuards(PermissionGuard)
@RequirePermission('carousels:write')
export class AdminCarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all carousels — all statuses, optionally filtered by placement / status (admin)',
  })
  @ApiResponse({ status: 200, description: 'List of carousels', type: AdminCarouselListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminCarouselListQueryDto): Promise<AdminCarouselListResponse> {
    return this.carouselService.findAllAdmin(query);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a carousel by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 200, description: 'Carousel found', type: CarouselResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Carousel not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<CarouselResponseEnvelope> {
    const carousel = await this.carouselService.findByIdAdmin(id);

    return { data: carousel };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a carousel (admin)' })
  @ApiResponse({ status: 201, description: 'Carousel created', type: CarouselResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Category not found (source = CATEGORY)' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateCarouselDto): Promise<CarouselResponseEnvelope> {
    const carousel = await this.carouselService.create(dto);

    return { data: carousel };
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a carousel (admin)' })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 200, description: 'Carousel updated', type: CarouselResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Carousel (or target category) not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCarouselDto,
  ): Promise<CarouselResponseEnvelope> {
    const carousel = await this.carouselService.update(id, dto);

    return { data: carousel };
  }

  @Patch(':id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Publish a carousel (admin)' })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 200, description: 'Carousel published', type: CarouselResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Carousel not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async publish(@Param('id') id: string): Promise<CarouselResponseEnvelope> {
    const carousel = await this.carouselService.publish(id);

    return { data: carousel };
  }

  @Patch(':id/unpublish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unpublish a carousel (admin)' })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 200, description: 'Carousel unpublished', type: CarouselResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Carousel not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async unpublish(@Param('id') id: string): Promise<CarouselResponseEnvelope> {
    const carousel = await this.carouselService.unpublish(id);

    return { data: carousel };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a carousel (admin)' })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 204, description: 'Carousel deleted (items cascade)' })
  @ApiResponse({ status: 404, description: 'Carousel not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.carouselService.delete(id);
  }

  @Get(':id/items')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Get a carousel's hand-picked items (admin)" })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 200, description: 'Current items', type: CarouselItemListResponse })
  @ApiResponse({ status: 404, description: 'Carousel not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getItems(@Param('id') id: string): Promise<CarouselItemListResponse> {
    const items = await this.carouselService.getItems(id);

    return { data: items };
  }

  @Put(':id/items')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Full-replace a carousel's hand-picked items (admin)" })
  @ApiParam({ name: 'id', description: 'Carousel UUID' })
  @ApiResponse({ status: 200, description: 'Replaced items', type: CarouselItemListResponse })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Carousel not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async setItems(
    @Param('id') id: string,
    @Body() dto: SetCarouselItemsDto,
  ): Promise<CarouselItemListResponse> {
    const items = await this.carouselService.setItems(id, dto);

    return { data: items };
  }
}
