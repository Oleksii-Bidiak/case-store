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
  ApiExtraModels,
  ApiProperty,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto, ProductListQueryDto } from './dto';
import { AdminGuard } from '../auth/guards';
import {
  ProductEntity,
  PublicProductEntity,
  ProductGroupEntity,
  ProductImageEntity,
  ProductCategoryEntity,
  ProductVariantSummaryEntity,
  ProductVariantColorEntity,
} from './entities';

/**
 * Response envelope for a single product.
 */
class ProductResponseEnvelope {
  @ApiProperty({ type: ProductEntity })
  data!: ProductEntity;
}

/**
 * Pagination metadata.
 */
class PaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages!: number;
}

/**
 * Response envelope for a paginated product list.
 */
class ProductListResponseEnvelope {
  @ApiProperty({ type: [PublicProductEntity], description: 'Products for the current page' })
  data!: PublicProductEntity[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}

/**
 * Response envelope for a product detail with relations.
 */
class ProductDetailResponseEnvelope {
  @ApiProperty({ type: PublicProductEntity })
  data!: PublicProductEntity;

  @ApiProperty({ type: ProductCategoryEntity })
  category!: ProductCategoryEntity;

  @ApiProperty({ type: ProductGroupEntity, nullable: true })
  group!: ProductGroupEntity | null;

  @ApiProperty({ type: [ProductImageEntity] })
  images!: ProductImageEntity[];
}

/**
 * Admin preview envelope (TASK-155). Same shape as the public detail envelope
 * but carries the full {@link ProductEntity} (raw `stock`, `isActive`) so staff
 * can preview deactivated products.
 */
class AdminProductPreviewResponseEnvelope {
  @ApiProperty({ type: ProductEntity })
  data!: ProductEntity;

  @ApiProperty({ type: ProductCategoryEntity })
  category!: ProductCategoryEntity;

  @ApiProperty({ type: ProductGroupEntity, nullable: true })
  group!: ProductGroupEntity | null;

  @ApiProperty({ type: [ProductImageEntity] })
  images!: ProductImageEntity[];
}

/**
 * Type aliases for controller return types.
 */
type ProductResponse = { data: ProductEntity };
type ProductListResponse = { data: PublicProductEntity[]; meta: PaginationMeta };
type ProductDetailResponse = {
  data: PublicProductEntity;
  category: ProductCategoryEntity;
  group: ProductGroupEntity | null;
  images: ProductImageEntity[];
};
type AdminProductPreviewResponse = {
  data: ProductEntity;
  category: ProductCategoryEntity;
  group: ProductGroupEntity | null;
  images: ProductImageEntity[];
};

/**
 * Controller for product browsing and admin product management.
 *
 * Public endpoints (no auth required):
 *   GET  /products           — List active products (paginated, filterable)
 *   GET  /products/:slug     — Get product detail by slug
 *
 * Admin endpoints (ADMIN role required):
 *   GET    /products/admin/:id    — Get a product by UUID (for edit forms)
 *   POST   /products              — Create a new product
 *   PUT    /products/:id          — Update a product
 *   PATCH  /products/:id/deactivate — Deactivate a product
 *   PATCH  /products/:id/activate   — Activate a product
 */
@ApiTags('Products')
@ApiExtraModels(
  ProductEntity,
  PublicProductEntity,
  ProductGroupEntity,
  ProductImageEntity,
  ProductCategoryEntity,
  ProductVariantSummaryEntity,
  ProductVariantColorEntity,
  ProductResponseEnvelope,
  ProductListResponseEnvelope,
  ProductDetailResponseEnvelope,
  AdminProductPreviewResponseEnvelope,
)
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * GET /api/products
   *
   * Returns a paginated list of products.
   * Supports filtering by category, active status, price range, and text search.
   * Public endpoint — no authentication required.
   */
  @Get()
  @ApiOperation({ summary: 'List products' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of products',
    type: ProductListResponseEnvelope,
  })
  async findAll(@Query() query: ProductListQueryDto): Promise<ProductListResponse> {
    return this.productService.findAll(query);
  }

  /**
   * GET /api/products/:slug
   *
   * Returns a product by slug with its category, variants, and images.
   * Public endpoint — no authentication required.
   */
  @Get(':slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiParam({ name: 'slug', description: 'Product URL slug' })
  @ApiResponse({
    status: 200,
    description: 'Product detail with relations',
    type: ProductDetailResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findBySlug(@Param('slug') slug: string): Promise<ProductDetailResponse> {
    return this.productService.findBySlug(slug);
  }

  /**
   * GET /api/products/admin/preview/:slug
   *
   * Returns the full product detail by slug INCLUDING deactivated products, so
   * admins can preview hidden products live before re-activating them (TASK-155).
   * Admin-only. Intended for the store-admin preview page; do NOT call from
   * public paths — the public `GET /products/:slug` hides deactivated products.
   *
   * IMPORTANT: this handler MUST be declared before `@Get('admin/:id')`. NestJS
   * matches routes in declaration order; if `admin/:id` came first it would
   * capture the literal string "preview" as `:id` and this route would be
   * unreachable.
   */
  @Get('admin/preview/:slug')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Preview a product by slug, including deactivated (admin)',
    operationId: 'productControllerPreviewProductBySlug',
  })
  @ApiParam({ name: 'slug', description: 'Product URL slug' })
  @ApiResponse({
    status: 200,
    description: 'Product detail (including deactivated products)',
    type: AdminProductPreviewResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findPreviewBySlug(@Param('slug') slug: string): Promise<AdminProductPreviewResponse> {
    return this.productService.findBySlugForAdminPreview(slug);
  }

  /**
   * GET /api/products/admin/:id
   *
   * Returns a single product by UUID. Admin-only endpoint.
   * Used to pre-populate the admin edit form (admin routes are ID-based, not
   * slug-based). A dedicated `admin/` prefix avoids colliding with the public
   * `GET /products/:slug` route.
   */
  @Get('admin/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get product by ID (admin)', operationId: 'productControllerFindById' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product detail', type: ProductResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<ProductResponse> {
    const product = await this.productService.findById(id);

    return { data: product };
  }

  /**
   * POST /api/products
   *
   * Creates a new product. Admin-only endpoint.
   * Slug is auto-generated from name if not provided.
   */
  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a product (admin)' })
  @ApiResponse({ status: 201, description: 'Product created', type: ProductResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    const product = await this.productService.create(dto);

    return { data: product };
  }

  /**
   * PUT /api/products/:id
   *
   * Updates an existing product. Admin-only endpoint.
   * Only provided fields will be updated.
   */
  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a product (admin)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product updated', type: ProductResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductResponse> {
    const product = await this.productService.update(id, dto);

    return { data: product };
  }

  /**
   * PATCH /api/products/:id/deactivate
   *
   * Deactivates a product (sets isActive = false). Admin-only endpoint.
   */
  @Patch(':id/deactivate')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate a product (admin)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product deactivated', type: ProductResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async deactivate(@Param('id') id: string): Promise<ProductResponse> {
    const product = await this.productService.deactivate(id);

    return { data: product };
  }

  /**
   * PATCH /api/products/:id/activate
   *
   * Activates a product (sets isActive = true). Admin-only endpoint.
   */
  @Patch(':id/activate')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activate a product (admin)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product activated', type: ProductResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async activate(@Param('id') id: string): Promise<ProductResponse> {
    const product = await this.productService.activate(id);

    return { data: product };
  }

  /**
   * DELETE /api/products/:id
   *
   * Soft-deletes a product (sets `deletedAt`, hides it from all reads, and
   * frees its slug/sku). Admin-only. The row is retained so historical order
   * items still resolve. Returns 204 No Content.
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a product (admin, soft-delete)', operationId: 'deleteProduct' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.productService.delete(id);
  }
}
