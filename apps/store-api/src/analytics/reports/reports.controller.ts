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
import { MoneyFlowEntriesQueryDto } from './dto/money-flow-entries-query.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { BrandReportEntity, CategoryReportEntity } from './entities/catalogue-report.entity';
import { MoneyFlowEntryEntity } from './entities/money-flow-entry.entity';
import { MoneyFlowReportEntity } from './entities/money-flow-report.entity';
import { MoneyFlowReportService } from './money-flow-report.service';
import { ProductsReportQueryDto } from './dto/products-report-query.dto';
import { ProductsReportEntity } from './entities/products-report.entity';
import { SalesReportEntity } from './entities/sales-report.entity';
import { ProductsReportService } from './products-report.service';
import { RegistrationsReportEntity } from './entities/registrations-report.entity';
import { RegistrationsReportService } from './registrations-report.service';
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

class RegistrationsReportEnvelope {
  @ApiProperty({ type: RegistrationsReportEntity })
  data!: RegistrationsReportEntity;
}

class BrandReportEnvelope {
  @ApiProperty({ type: BrandReportEntity })
  data!: BrandReportEntity;
}

class MoneyFlowReportEnvelope {
  @ApiProperty({ type: MoneyFlowReportEntity })
  data!: MoneyFlowReportEntity;
}

class MoneyFlowEntriesPaginationMeta {
  @ApiProperty({ example: 240 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 5 }) totalPages!: number;
}

class MoneyFlowEntriesEnvelope {
  @ApiProperty({ type: [MoneyFlowEntryEntity] }) data!: MoneyFlowEntryEntity[];
  @ApiProperty({ type: MoneyFlowEntriesPaginationMeta }) meta!: MoneyFlowEntriesPaginationMeta;
}

/** Shared by both money flow routes: the ledger rules the numbers follow. */
const MONEY_FLOW_RULES =
  'Read from the order money ledger. An entry counts on the Kyiv calendar day of its ' +
  '`occurredAt` (when the money moved). A reversal (сторно) keeps its original’s kind and ' +
  'direction and is subtracted on ITS own day, so an earlier period never changes. Voided ' +
  'entries never moved money and are excluded everywhere. LiqPay refunds still REQUESTED are ' +
  'counted and also reported apart. All amounts are integer kopecks. Requires analytics:read ' +
  '(the route) plus analytics:revenue AND payments:read, checked before the period. Not cached.';

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
    private readonly registrationsReportService: RegistrationsReportService,
    private readonly moneyFlowReportService: MoneyFlowReportService,
  ) {}

  /** «Рух коштів» — money in and out by ledger kind, with who-owes-whom right now. */
  @Get('money-flow')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'Money in and out of the period by ledger kind, with current debts and overpayments',
    description:
      MONEY_FLOW_RULES +
      ' `rows` is always the 8 ledger kinds (IN kinds, then OUT kinds), zero rows included. ' +
      '`totals` (in, out, net = in − out, requested out) are compared with the previous range. ' +
      '`balances` is a snapshot as of now, independent of the period: `debt` = DELIVERED orders ' +
      'with a positive balance (order list `hasDebt=true`), `owedToCustomer` = orders of any ' +
      'status with a negative balance (order list `owedToCustomer=true`).',
    operationId: 'getMoneyFlowReport',
  })
  @ApiResponse({ status: 200, description: 'Money flow report', type: MoneyFlowReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — analytics:read, analytics:revenue and payments:read required',
  })
  async getMoneyFlow(
    @Query() query: PeriodQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: MoneyFlowReportEntity }> {
    return { data: await this.moneyFlowReportService.getMoneyFlowReport(query, actor) };
  }

  /** «Рух коштів» register — the entries behind the report, one page at a time. */
  @Get('money-flow/entries')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'The ledger entries of the period, oldest first, optionally of one kind',
    description:
      MONEY_FLOW_RULES +
      ' Ordered by `occurredAt`, then `id`. `signedKop` is negative for a reversal only — the ' +
      'direction is not folded in (an OUT payout is positive; read it under `direction`). ' +
      '`requested` flags a LiqPay refund awaiting confirmation; `actorName` is null for LiqPay ' +
      'and system entries.',
    operationId: 'getMoneyFlowEntries',
  })
  @ApiResponse({ status: 200, description: 'A page of entries', type: MoneyFlowEntriesEnvelope })
  @ApiResponse({ status: 400, description: 'The period, kind, page or limit cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — analytics:read, analytics:revenue and payments:read required',
  })
  async getMoneyFlowEntries(
    @Query() query: MoneyFlowEntriesQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: MoneyFlowEntryEntity[]; meta: MoneyFlowEntriesPaginationMeta }> {
    const page = await this.moneyFlowReportService.getMoneyFlowEntries(query, actor);
    return { data: page.items, meta: page.meta };
  }

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

  /** «Реєстрації» — new customer accounts, compared, with the guest → account share. */
  @Get('registrations')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'New customer accounts in a period, compared with the previous one',
    description:
      'Customer accounts created in the period (staff excluded; later-deleted accounts still ' +
      'count), how many of them had placed a guest order with the same email before ' +
      'registering, and a daily series over Kyiv days. No money in it.',
    operationId: 'getRegistrationsReport',
  })
  @ApiResponse({
    status: 200,
    description: 'Registrations report',
    type: RegistrationsReportEnvelope,
  })
  @ApiResponse({ status: 400, description: 'The period cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — analytics:read required' })
  async getRegistrations(
    @Query() query: PeriodQueryDto,
  ): Promise<{ data: RegistrationsReportEntity }> {
    return { data: await this.registrationsReportService.getRegistrationsReport(query) };
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
