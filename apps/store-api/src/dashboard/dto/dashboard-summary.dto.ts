import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-decorated response classes for `GET /api/admin/dashboard/summary`.
 *
 * Every field on every nested class carries an explicit `@ApiProperty({ type })`
 * so the OpenAPI schema is fully resolved and Orval emits typed models instead
 * of `{ [key: string]: unknown }`. Arrays use `type: [Class]`. This is the same
 * discipline applied in plans 028 and 029.
 */

export class DailyDataPointDto {
  @ApiProperty({ type: String, description: 'Day bucket (YYYY-MM-DD)', example: '2026-06-13' })
  date!: string;

  @ApiProperty({ type: Number, description: 'Aggregated value for the day', example: 1250.5 })
  value!: number;
}

export class OrderStatusCountDto {
  @ApiProperty({ type: String, description: 'Order status', example: 'PENDING' })
  status!: string;

  @ApiProperty({ type: Number, description: 'Number of orders with this status', example: 12 })
  count!: number;
}

export class RevenueMetricsDto {
  @ApiProperty({
    type: Number,
    description: 'Lifetime revenue (excl. cancelled/refunded)',
    example: 48230.75,
  })
  totalRevenue!: number;

  @ApiProperty({ type: Number, description: 'Revenue in the last 30 days', example: 8120.4 })
  revenueLast30Days!: number;

  @ApiProperty({ type: [DailyDataPointDto], description: 'Daily revenue for the last 30 days' })
  revenueByDay!: DailyDataPointDto[];
}

export class OrderMetricsDto {
  @ApiProperty({ type: Number, description: 'Total number of orders', example: 312 })
  totalOrders!: number;

  @ApiProperty({ type: [OrderStatusCountDto], description: 'Order counts grouped by status' })
  ordersByStatus!: OrderStatusCountDto[];

  @ApiProperty({ type: [DailyDataPointDto], description: 'Daily order count for the last 30 days' })
  ordersByDay!: DailyDataPointDto[];
}

export class UserMetricsDto {
  @ApiProperty({ type: Number, description: 'Total number of registered users', example: 1045 })
  totalUsers!: number;

  @ApiProperty({
    type: [DailyDataPointDto],
    description: 'Daily new-user count for the last 30 days',
  })
  newUsersByDay!: DailyDataPointDto[];
}

export class TopProductDto {
  @ApiProperty({
    type: String,
    description: 'Product UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  productId!: string;

  @ApiProperty({ type: String, description: 'Product name', example: 'USB-C Cable 2m' })
  name!: string;

  @ApiProperty({
    type: Number,
    description: 'Total revenue earned by this product',
    example: 3420.0,
  })
  totalRevenue!: number;
}

export class ProductMetricsDto {
  @ApiProperty({ type: Number, description: 'Total number of products', example: 128 })
  totalProducts!: number;

  @ApiProperty({ type: Number, description: 'Number of active products', example: 119 })
  activeProducts!: number;

  @ApiProperty({ type: [TopProductDto], description: 'Top products by total revenue' })
  topProducts!: TopProductDto[];
}

export class LowStockVariantDto {
  @ApiProperty({ type: String, description: 'Variant UUID' })
  variantId!: string;

  @ApiProperty({ type: String, description: 'Variant name', example: 'Black / iPhone 15 Pro' })
  variantName!: string;

  @ApiProperty({ type: String, description: 'Parent product UUID' })
  productId!: string;

  @ApiProperty({ type: String, description: 'Parent product name', example: 'Silicone Case' })
  productName!: string;

  @ApiProperty({ type: Number, description: 'Remaining stock units', example: 3 })
  stock!: number;
}

export class InventoryMetricsDto {
  @ApiProperty({
    type: [LowStockVariantDto],
    description: 'Variants at or below the low-stock threshold',
  })
  lowStockVariants!: LowStockVariantDto[];
}

export class DashboardSummaryResponse {
  @ApiProperty({ type: RevenueMetricsDto })
  revenue!: RevenueMetricsDto;

  @ApiProperty({ type: OrderMetricsDto })
  orders!: OrderMetricsDto;

  @ApiProperty({ type: UserMetricsDto })
  users!: UserMetricsDto;

  @ApiProperty({ type: ProductMetricsDto })
  products!: ProductMetricsDto;

  @ApiProperty({ type: InventoryMetricsDto })
  inventory!: InventoryMetricsDto;
}
