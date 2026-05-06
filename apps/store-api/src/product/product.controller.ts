import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
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
interface ProductResponse {
  data: ProductEntity;
}

/**
 * Response envelope for a paginated product list.
 */
interface ProductListResponse {
  data: ProductEntity[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Response envelope for a product detail with relations.
 */
interface ProductDetailResponse {
  data: ProductEntity;
  category: ProductCategoryEntity;
  variants: ProductVariantEntity[];
  images: ProductImageEntity[];
}

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
  async activate(@Param('id') id: string): Promise<ProductResponse> {
    const product = await this.productService.activate(id);

    return { data: product };
  }
}
