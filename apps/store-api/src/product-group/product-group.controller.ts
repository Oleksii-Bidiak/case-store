import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { ProductGroupService } from './product-group.service';
import { CreateProductGroupDto, UpdateProductGroupDto } from './dto';
import { AdminGuard } from '../auth/guards';
import { ProductGroupSummaryEntity, ProductGroupDetailEntity } from './entities';

/**
 * Response envelope for a single product group (admin detail view).
 */
class ProductGroupResponseEnvelope {
  @ApiProperty({ type: ProductGroupDetailEntity })
  data!: ProductGroupDetailEntity;
}

/**
 * Response envelope for the product group list.
 */
class ProductGroupListResponse {
  @ApiProperty({ type: [ProductGroupSummaryEntity] })
  data!: ProductGroupSummaryEntity[];
}

/**
 * Admin product-group management (TASK-142).
 *
 *   GET   /api/product-groups        — List groups (axes + position counts)
 *   GET   /api/product-groups/:id    — Get a group with axes and positions
 *   POST  /api/product-groups        — Create a group
 *   PATCH /api/product-groups/:id    — Update a group (name / axes / active)
 *
 * All endpoints require the ADMIN role.
 */
@ApiTags('Product Groups')
@ApiExtraModels(
  ProductGroupSummaryEntity,
  ProductGroupDetailEntity,
  ProductGroupResponseEnvelope,
  ProductGroupListResponse,
)
@Controller('product-groups')
@UseGuards(AdminGuard)
export class ProductGroupController {
  constructor(private readonly service: ProductGroupService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all product groups (admin)' })
  @ApiResponse({
    status: 200,
    description: 'List of product groups',
    type: ProductGroupListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(): Promise<ProductGroupListResponse> {
    const data = await this.service.findAll();
    return { data };
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a product group with axes and positions (admin)' })
  @ApiParam({ name: 'id', description: 'Product group UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product group found',
    type: ProductGroupResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Product group not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<ProductGroupResponseEnvelope> {
    const data = await this.service.findById(id);
    return { data };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a product group (admin)' })
  @ApiResponse({
    status: 201,
    description: 'Product group created',
    type: ProductGroupResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateProductGroupDto): Promise<ProductGroupResponseEnvelope> {
    const data = await this.service.create(dto);
    return { data };
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a product group (admin)' })
  @ApiParam({ name: 'id', description: 'Product group UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product group updated',
    type: ProductGroupResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Product group not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductGroupDto,
  ): Promise<ProductGroupResponseEnvelope> {
    const data = await this.service.update(id, dto);
    return { data };
  }
}
