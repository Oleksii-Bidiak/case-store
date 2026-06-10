import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
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
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import {
  ProductEntity,
  ProductVariantEntity,
  ProductImageEntity,
  ProductCategoryEntity,
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
  @ApiProperty({ type: [ProductEntity], description: 'Products for the current page' })
  data!: ProductEntity[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}

/**
 * Response envelope for a product detail with relations.
 */
class ProductDetailResponseEnvelope {
  @ApiProperty({ type: ProductEntity })
  data!: ProductEntity;

  @ApiProperty({ type: ProductCategoryEntity })
  category!: ProductCategoryEntity;

  @ApiProperty({ type: [ProductVariantEntity] })
  variants!: ProductVariantEntity[];

  @ApiProperty({ type: [ProductImageEntity] })
  images!: ProductImageEntity[];
}

/**
 * Type aliases for controller return types.
 */
type ProductResponse = { data: ProductEntity };
type ProductListResponse = { data: ProductEntity[]; meta: PaginationMeta };
type ProductDetailResponse = {
  data: ProductEntity;
  category: ProductCategoryEntity;
  variants: ProductVariantEntity[];
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
 *   POST   /products              — Create a new product
 *   PUT    /products/:id          — Update a product
 *   PATCH  /products/:id/deactivate — Deactivate a product
 *   PATCH  /products/:id/activate   — Activate a product
 */
@ApiTags('Products')
@ApiExtraModels(
  ProductEntity,
  ProductVariantEntity,
  ProductImageEntity,
  ProductCategoryEntity,
  ProductResponseEnvelope,
  ProductListResponseEnvelope,
  ProductDetailResponseEnvelope,
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
   * POST /api/products
   *
   * Creates a new product. Admin-only endpoint.
   * Slug is auto-generated from name if not provided.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
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
}
