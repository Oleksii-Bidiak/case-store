import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
import { DiscountService } from './discount.service';
import { CreateDiscountDto, UpdateDiscountDto, DiscountListQueryDto } from './dto';
import { DiscountEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/** Response envelope for a single discount. */
class DiscountResponseEnvelope {
  @ApiProperty({ type: DiscountEntity })
  data!: DiscountEntity;
}

/** Pagination metadata for the admin discount list. */
class AdminDiscountPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/** Response envelope for a paginated discount list. */
class AdminDiscountListResponse {
  @ApiProperty({ type: [DiscountEntity], description: 'Discounts for the current page' })
  data!: DiscountEntity[];

  @ApiProperty({ type: AdminDiscountPaginationMeta })
  meta!: AdminDiscountPaginationMeta;
}

/** Response envelope for a deactivated discount id. */
class DiscountDeletedEnvelope {
  @ApiProperty({
    description: 'Deactivated discount id',
    example: { id: '550e8400-e29b-41d4-a716-446655440000' },
  })
  data!: { id: string };
}

/**
 * Admin discount management (ADMIN role required).
 *
 *   GET    /api/admin/discounts        — paginated list (filter + search)
 *   POST   /api/admin/discounts        — create a code
 *   GET    /api/admin/discounts/:id    — get one
 *   PATCH  /api/admin/discounts/:id    — update
 *   DELETE /api/admin/discounts/:id    — soft-deactivate
 */
@ApiTags('Discounts')
@ApiExtraModels(
  DiscountEntity,
  DiscountResponseEnvelope,
  AdminDiscountListResponse,
  AdminDiscountPaginationMeta,
  DiscountDeletedEnvelope,
)
@Controller('admin/discounts')
@UseGuards(PermissionGuard)
@RequirePermission('discounts:write')
export class AdminDiscountController {
  constructor(private readonly discountService: DiscountService) {}

  /** GET /api/admin/discounts — paginated list. */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List discounts (admin)', operationId: 'adminListDiscounts' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of discounts',
    type: AdminDiscountListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async list(@Query() query: DiscountListQueryDto): Promise<AdminDiscountListResponse> {
    return this.discountService.list(query);
  }

  /** GET /api/admin/discounts/:id — get one. */
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a discount by id (admin)', operationId: 'adminGetDiscount' })
  @ApiParam({ name: 'id', description: 'Discount UUID' })
  @ApiResponse({ status: 200, description: 'Discount found', type: DiscountResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getById(@Param('id') id: string): Promise<DiscountResponseEnvelope> {
    const discount = await this.discountService.getById(id);
    return { data: discount };
  }

  /** POST /api/admin/discounts — create a code. */
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a discount (admin)', operationId: 'adminCreateDiscount' })
  @ApiResponse({ status: 201, description: 'Discount created', type: DiscountResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate code' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateDiscountDto): Promise<DiscountResponseEnvelope> {
    const discount = await this.discountService.create(dto);
    return { data: discount };
  }

  /** PATCH /api/admin/discounts/:id — update. */
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a discount (admin)', operationId: 'adminUpdateDiscount' })
  @ApiParam({ name: 'id', description: 'Discount UUID' })
  @ApiResponse({ status: 200, description: 'Discount updated', type: DiscountResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate code' })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountDto,
  ): Promise<DiscountResponseEnvelope> {
    const discount = await this.discountService.update(id, dto);
    return { data: discount };
  }

  /** DELETE /api/admin/discounts/:id — soft-deactivate. */
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Deactivate a discount (admin)',
    operationId: 'adminDeactivateDiscount',
  })
  @ApiParam({ name: 'id', description: 'Discount UUID' })
  @ApiResponse({ status: 200, description: 'Discount deactivated', type: DiscountDeletedEnvelope })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async deactivate(@Param('id') id: string): Promise<DiscountDeletedEnvelope> {
    const discount = await this.discountService.deactivate(id);
    return { data: { id: discount.id } };
  }
}
