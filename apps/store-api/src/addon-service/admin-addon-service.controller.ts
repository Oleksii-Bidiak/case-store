import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import { AddonServiceService } from './addon-service.service';
import {
  AddonServiceListQueryDto,
  CreateAddonServiceDto,
  SetCategoryTemplateDto,
  SetProductDeltaDto,
  UpdateAddonServiceDto,
  UpdateAddonServiceStatusDto,
} from './dto';
import {
  AddonServiceDeltaEntity,
  AddonServiceEntity,
  ResolvedCategoryTemplateEntity,
} from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

class AddonServiceResponseEnvelope {
  @ApiProperty({ type: AddonServiceEntity })
  data!: AddonServiceEntity;
}

class AddonServiceListResponse {
  @ApiProperty({ type: [AddonServiceEntity], description: 'Active add-on services' })
  data!: AddonServiceEntity[];
}

class AdminAddonServicePaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 4 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

class AdminAddonServiceListResponse {
  @ApiProperty({ type: [AddonServiceEntity], description: 'Add-on services for the current page' })
  data!: AddonServiceEntity[];

  @ApiProperty({ type: AdminAddonServicePaginationMeta })
  meta!: AdminAddonServicePaginationMeta;
}

class CategoryTemplateIds {
  @ApiProperty({
    type: [String],
    description: "Ids of the services in the category's OWN template",
  })
  addonServiceIds!: string[];
}

class CategoryTemplateIdsResponse {
  @ApiProperty({ type: CategoryTemplateIds })
  data!: CategoryTemplateIds;
}

class ResolvedCategoryTemplateResponse {
  @ApiProperty({ type: ResolvedCategoryTemplateEntity })
  data!: ResolvedCategoryTemplateEntity;
}

class AddonServiceDeltaResponse {
  @ApiProperty({ type: AddonServiceDeltaEntity })
  data!: AddonServiceDeltaEntity;
}

class AddonServiceDeltaListResponse {
  @ApiProperty({ type: [AddonServiceDeltaEntity], description: 'Deltas declared on the product' })
  data!: AddonServiceDeltaEntity[];
}

/**
 * Admin add-on-service management (ADMIN role required, TASK-174).
 *
 * Three groups of routes, all under the `addon-services` prefix it shares with
 * the public {@link AddonServiceController} (the literal `admin/…`,
 * `templates/…` and `deltas/…` segments never collide with the public
 * `resolved-for-product/:productId`):
 *
 *   - catalog CRUD (mirrors `AdminBrandController` 1:1);
 *   - CATEGORY templates — the reusable, inherited half of the model;
 *   - PRODUCT deltas — the per-product ADD/REMOVE/OVERRIDE exceptions.
 */
@ApiTags('AddonServices')
@ApiExtraModels(
  AddonServiceEntity,
  AddonServiceResponseEnvelope,
  AddonServiceListResponse,
  AdminAddonServicePaginationMeta,
  AdminAddonServiceListResponse,
  CategoryTemplateIds,
  CategoryTemplateIdsResponse,
  ResolvedCategoryTemplateEntity,
  ResolvedCategoryTemplateResponse,
  AddonServiceDeltaEntity,
  AddonServiceDeltaResponse,
  AddonServiceDeltaListResponse,
)
@Controller('addon-services')
@UseGuards(PermissionGuard)
@RequirePermission('addons:write')
export class AdminAddonServiceController {
  constructor(private readonly addonServiceService: AddonServiceService) {}

  // ─── Catalog CRUD ─────────────────────────────────────────────────────────

  @Get('admin/list')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all add-on services including inactive (admin)',
    operationId: 'addonServiceControllerAdminFindAll',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of add-on services (all statuses)',
    type: AdminAddonServiceListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAllAdmin(
    @Query() query: AddonServiceListQueryDto,
  ): Promise<AdminAddonServiceListResponse> {
    return this.addonServiceService.findAllAdmin(query);
  }

  @Get('admin/active')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List active add-on services for the admin pickers (admin)',
    operationId: 'addonServiceControllerAdminFindActive',
  })
  @ApiResponse({ status: 200, description: 'Active services', type: AddonServiceListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAllActive(): Promise<AddonServiceListResponse> {
    return this.addonServiceService.findAllActive();
  }

  @Get('admin/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get add-on service by ID (admin)',
    operationId: 'addonServiceControllerFindById',
  })
  @ApiParam({ name: 'id', description: 'Add-on service UUID' })
  @ApiResponse({ status: 200, description: 'Service found', type: AddonServiceResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Add-on service not found' })
  async findById(@Param('id') id: string): Promise<AddonServiceResponseEnvelope> {
    return { data: await this.addonServiceService.findById(id) };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create an add-on service (admin)' })
  @ApiResponse({ status: 201, description: 'Service created', type: AddonServiceResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateAddonServiceDto): Promise<AddonServiceResponseEnvelope> {
    return { data: await this.addonServiceService.create(dto) };
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update an add-on service (admin)' })
  @ApiParam({ name: 'id', description: 'Add-on service UUID' })
  @ApiResponse({ status: 200, description: 'Service updated', type: AddonServiceResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Add-on service not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAddonServiceDto,
  ): Promise<AddonServiceResponseEnvelope> {
    return { data: await this.addonServiceService.update(id, dto) };
  }

  @Patch(':id/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Toggle add-on service active status (admin)' })
  @ApiParam({ name: 'id', description: 'Add-on service UUID' })
  @ApiResponse({ status: 200, description: 'Status updated', type: AddonServiceResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Add-on service not found' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAddonServiceStatusDto,
  ): Promise<AddonServiceResponseEnvelope> {
    return { data: await this.addonServiceService.setActive(id, dto.isActive) };
  }

  // ─── Category templates ───────────────────────────────────────────────────

  @Get('templates/category/:categoryId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Get a category's OWN add-on template (no inheritance) (admin)",
    operationId: 'addonServiceControllerGetCategoryTemplate',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Own template', type: CategoryTemplateIdsResponse })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryTemplate(
    @Param('categoryId') categoryId: string,
  ): Promise<CategoryTemplateIdsResponse> {
    return { data: await this.addonServiceService.findCategoryTemplate(categoryId) };
  }

  @Get('templates/category/:categoryId/resolved')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Resolve a category's effective template (own / inherited / none) (admin)",
    operationId: 'addonServiceControllerResolveCategoryTemplate',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({
    status: 200,
    description: 'Resolved template with its source category',
    type: ResolvedCategoryTemplateResponse,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async resolveCategoryTemplate(
    @Param('categoryId') categoryId: string,
  ): Promise<ResolvedCategoryTemplateResponse> {
    return { data: await this.addonServiceService.resolveTemplateForCategory(categoryId) };
  }

  @Patch('templates/category/:categoryId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Full-replace a category's own add-on template (admin)",
    operationId: 'addonServiceControllerSetCategoryTemplate',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Template replaced', type: CategoryTemplateIdsResponse })
  @ApiResponse({ status: 400, description: 'Unknown add-on service id' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async setCategoryTemplate(
    @Param('categoryId') categoryId: string,
    @Body() dto: SetCategoryTemplateDto,
  ): Promise<CategoryTemplateIdsResponse> {
    return { data: await this.addonServiceService.setCategoryTemplate(categoryId, dto) };
  }

  // ─── Product deltas ───────────────────────────────────────────────────────

  @Get('deltas/product/:productId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List the add-on deltas declared on a product (admin)',
    operationId: 'addonServiceControllerGetProductDeltas',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Deltas', type: AddonServiceDeltaListResponse })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductDeltas(
    @Param('productId') productId: string,
  ): Promise<AddonServiceDeltaListResponse> {
    return { data: await this.addonServiceService.findProductDeltas(productId) };
  }

  @Put('deltas/product/:productId/:addonServiceId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Upsert one add-on delta on a product (admin)',
    operationId: 'addonServiceControllerSetProductDelta',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiParam({ name: 'addonServiceId', description: 'Add-on service UUID' })
  @ApiResponse({ status: 200, description: 'Delta upserted', type: AddonServiceDeltaResponse })
  @ApiResponse({ status: 400, description: 'Invalid price for the given delta type' })
  @ApiResponse({ status: 404, description: 'Product or add-on service not found' })
  async setProductDelta(
    @Param('productId') productId: string,
    @Param('addonServiceId') addonServiceId: string,
    @Body() dto: SetProductDeltaDto,
  ): Promise<AddonServiceDeltaResponse> {
    return {
      data: await this.addonServiceService.setProductDelta(productId, addonServiceId, dto),
    };
  }

  @Delete('deltas/product/:productId/:addonServiceId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Clear one add-on delta, reverting the product to pure inheritance (admin)',
    operationId: 'addonServiceControllerClearProductDelta',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiParam({ name: 'addonServiceId', description: 'Add-on service UUID' })
  @ApiResponse({ status: 200, description: 'Delta cleared (idempotent)' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async clearProductDelta(
    @Param('productId') productId: string,
    @Param('addonServiceId') addonServiceId: string,
  ): Promise<{ data: null }> {
    await this.addonServiceService.clearProductDelta(productId, addonServiceId);
    return { data: null };
  }
}
