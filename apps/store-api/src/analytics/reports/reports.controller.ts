import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentActor,
  PermissionGuard,
  RequirePermission,
  type PermissionActor,
} from '../../auth/permissions';
import { CatalogueReportService } from './catalogue-report.service';
import { CategoryReportQueryDto } from './dto/category-report-query.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { BrandReportEntity, CategoryReportEntity } from './entities/catalogue-report.entity';
import { ProductsReportQueryDto } from './dto/products-report-query.dto';
import { ProductsReportEntity } from './entities/products-report.entity';
import { SalesReportEntity } from './entities/sales-report.entity';
import { ProductsReportService } from './products-report.service';
import { SalesReportService } from './sales-report.service';

class SalesReportEnvelope {
  @ApiProperty({ type: SalesReportEntity })
  data!: SalesReportEntity;
}

class CategoryReportEnvelope {
  @ApiProperty({ type: CategoryReportEntity })
  data!: CategoryReportEntity;
}

class ProductsReportEnvelope {
  @ApiProperty({ type: ProductsReportEntity })
  data!: ProductsReportEntity;
}

class BrandReportEnvelope {
  @ApiProperty({ type: BrandReportEntity })
  data!: BrandReportEntity;
}

/**
 * The `/analytics` reports (plan 188, TASK-686…690).
 *
 *   GET /api/admin/analytics/reports/sales?preset=30d
 *   GET /api/admin/analytics/reports/sales?preset=custom&from=2026-08-01&to=2026-08-31
 *
 * One controller for the five reports so they share a prefix, a tag in the
 * generated client, and the guard. Every route's door is `analytics:read`, the
 * same as the dashboard; money is decided in the services from
 * `analytics:revenue` — the sales report (nothing but money) is refused whole
 * without it, the reports that mix units and sums answer without the `revenue`
 * keys. The controller only passes the actor along.
 */
@ApiTags('Admin Analytics Reports')
@ApiBearerAuth('access-token')
@UseGuards(PermissionGuard)
@RequirePermission('analytics:read')
@Controller('admin/analytics/reports')
export class ReportsController {
  constructor(
    private readonly salesReportService: SalesReportService,
    private readonly catalogueReportService: CatalogueReportService,
    private readonly productsReportService: ProductsReportService,
  ) {}

  /** «Продажі за категоріями» — roots, or the children of `parentId`, each over its subtree. */
  @Get('categories')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'Sold units, orders and (with analytics:revenue) gross amount by category subtree',
    description:
      'Rows are the root categories, or the children of `parentId`, each summed over its whole ' +
      'subtree; an expansion ends with a `direct` row for products placed on the expanded ' +
      'category itself. Attribution uses the CURRENT catalogue (`basis: current-catalogue`). ' +
      '`revenue` is absent without analytics:revenue, and rows are then ranked by units.',
    operationId: 'getCategoryReport',
  })
  @ApiResponse({ status: 200, description: 'Category report', type: CategoryReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period or parentId cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — analytics:read required' })
  @ApiResponse({ status: 404, description: 'parentId names no category' })
  async getCategories(
    @Query() query: CategoryReportQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: CategoryReportEntity }> {
    return { data: await this.catalogueReportService.getCategoryReport(query, actor) };
  }

  /** «Лідери й аутсайдери» — best sellers and published products that sold nothing. */
  @Get('products')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'Best sellers of the period and published products with no sale in it',
    description:
      'Leaders are ranked by gross amount with analytics:revenue and by units without it (and ' +
      'then carry no `revenue`), each compared with its own previous-range sales. Outsiders are ' +
      'products on sale (active, not deleted, active category) that existed in the period and ' +
      'sold nothing in it, oldest first, with the total count.',
    operationId: 'getProductsReport',
  })
  @ApiResponse({ status: 200, description: 'Products report', type: ProductsReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period or limit cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — analytics:read required' })
  async getProducts(
    @Query() query: ProductsReportQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: ProductsReportEntity }> {
    return { data: await this.productsReportService.getProductsReport(query, actor) };
  }

  /** «Продажі за брендами» — flat, with «Без бренду» as `brandId: null`. */
  @Get('brands')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'Sold units, orders and (with analytics:revenue) gross amount by brand',
    description:
      'A flat row per brand that sold in the period or its comparison; products without a ' +
      'brand are the `brandId: null` row. Attribution uses the CURRENT catalogue. `revenue` is ' +
      'absent without analytics:revenue, and rows are then ranked by units.',
    operationId: 'getBrandReport',
  })
  @ApiResponse({ status: 200, description: 'Brand report', type: BrandReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — analytics:read required' })
  async getBrands(
    @Query() query: PeriodQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: BrandReportEntity }> {
    return { data: await this.catalogueReportService.getBrandReport(query, actor) };
  }

  /**
   * «Продажі за період». Withheld whole (403) from anyone without
   * `analytics:revenue` — owner's decision: there is nothing in it that is not
   * money, so a trimmed answer would be an empty one.
   *
   * The route's door is `analytics:read`, like every report and the dashboard;
   * the service then demands `analytics:revenue` on top. `analytics:revenue`
   * widens what a reader of analytics sees — it is not a door of its own, so a
   * person holding it without `analytics:read` is refused here exactly as on
   * the dashboard.
   */
  @Get('sales')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'Sales, refunds and net revenue for a period, compared with the previous one',
    description:
      'Sales = Σ totals of orders created in the period whose payment is PAID, ' +
      'PARTIALLY_REFUNDED or REFUNDED. Refunds = money returned in the period (refunded ' +
      'returns by resolution date, plus full payment refunds not covered by returns, by the ' +
      'date the payment became REFUNDED). Net = sales − refunds; average order value = net ÷ ' +
      'orders. Days are Kyiv calendar days.',
    operationId: 'getSalesReport',
  })
  @ApiResponse({ status: 200, description: 'Sales report', type: SalesReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — analytics:read and analytics:revenue required',
  })
  async getSales(
    @Query() query: PeriodQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: SalesReportEntity }> {
    const data = await this.salesReportService.getSalesReport(query, actor);
    return { data };
  }
}
