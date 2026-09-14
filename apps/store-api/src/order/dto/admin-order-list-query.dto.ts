import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PENDING_STALE_HOURS } from '../../dashboard/dashboard.types';
import { OrderListQueryDto } from './order-list-query.dto';

/**
 * Query parameters for the admin order list.
 *
 * Extends the customer {@link OrderListQueryDto} (pagination) with admin-only
 * filters: an arbitrary `userId` (admins see every user's orders), an optional
 * created-at date range, and sorting.
 *
 * Unlike the customer DTO the `status` filter here is **multi-value** (TASK-250)
 * to power the lifecycle preset tabs — notably "В обробці" (CONFIRMED +
 * PROCESSING), an OR a single-value param cannot express. The customer
 * `OrderListQueryDto` / `GET /api/orders` contract is untouched: this DTO
 * `OmitType`s the narrow scalar `status` off the base and redeclares its own
 * widened `OrderStatus[]` field (a covariant property override would fail to
 * compile — `OrderStatus[]` is not a subtype of `OrderStatus`).
 */
export class AdminOrderListQueryDto extends OmitType(OrderListQueryDto, ['status'] as const) {
  @ApiProperty({
    description:
      'Filter by one or more order statuses (comma-separated). A single value ' +
      '(`PENDING`) or CSV (`CONFIRMED,PROCESSING`) are both accepted; absent means all statuses.',
    type: String,
    required: false,
    example: 'CONFIRMED,PROCESSING',
  })
  // Read the ORIGINAL query value from `obj`, not the coerced `value` argument —
  // the global ValidationPipe runs with `enableImplicitConversion: true`, which
  // may coerce the raw value before this transform runs (same defensive pattern
  // as ProductCardsQueryDto.ids / ProductListQueryDto.isActive). Returns
  // undefined when nothing remains so "no filter" still means "all statuses".
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    const parts = Array.isArray(raw) ? raw : [raw];
    const values = parts
      .filter((part): part is string => typeof part === 'string')
      .flatMap((part) => part.split(','))
      .map((status) => status.trim())
      .filter((status) => status !== '');
    return values.length > 0 ? values : undefined;
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(OrderStatus).length)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiProperty({ description: 'Filter by owning user ID', required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID('loose')
  userId?: string;

  @ApiProperty({
    description:
      'Free-text search across order number (id prefix), email and phone — for account AND ' +
      'guest orders (TASK-336). This is what an operator actually has when a customer rings ' +
      'up: "my order ABC12345", or a phone number. Never a UUID.',
    required: false,
    maxLength: 120,
    example: 'ABC12345',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  // Read the ORIGINAL value from `obj` — the same enableImplicitConversion guard
  // the rest of this DTO uses — then trim, and collapse an all-whitespace search
  // to undefined so "no filter" cannot arrive disguised as an empty string.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  search?: string;

  @ApiProperty({
    description: 'Include orders created on or after this ISO date',
    required: false,
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    description: 'Include orders created on or before this ISO date',
    required: false,
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiProperty({
    description: 'Sort field (createdAt, total, status)',
    required: false,
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'total', 'status'], {
    message: 'sortBy must be one of: createdAt, total, status',
  })
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order (asc or desc)',
    required: false,
    default: 'desc',
    example: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiProperty({
    description:
      'Filter to active-but-unpaid ("in-transit") orders — paymentStatus != PAID AND ' +
      'status NOT IN (CANCELLED, REFUNDED). Deep-link target for the dashboard ' +
      'needs-action widget (TASK-248).',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument: the global
  // ValidationPipe runs with `enableImplicitConversion: true`, which coerces the
  // raw string to Boolean BEFORE this transform — and `Boolean('false')` is `true`,
  // so `?unpaidInTransit=false` would otherwise flip to `true`. Same guard as
  // ProductListQueryDto.isActive (TASK-150-B5 / TASK-230).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'unpaidInTransit must be true or false' })
  unpaidInTransit?: boolean;

  @ApiProperty({
    description:
      'Filter by payment status (TASK-425). Single-valued, unlike `status`: the queue is read ' +
      'as "show me the unpaid ones", never as a union of two payment states.',
    enum: PaymentStatus,
    required: false,
    example: PaymentStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(PaymentStatus, {
    message: `paymentStatus must be one of: ${Object.values(PaymentStatus).join(', ')}`,
  })
  paymentStatus?: PaymentStatus;

  @ApiProperty({
    description:
      'Filter by how the customer chose to pay (TASK-425) — the difference between a card ' +
      'order whose money never arrived and a cash-on-delivery order that is simply unpaid ' +
      'until the courier hands it over.',
    enum: PaymentMethod,
    required: false,
    example: PaymentMethod.ON_DELIVERY,
  })
  @IsOptional()
  @IsEnum(PaymentMethod, {
    message: `paymentMethod must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod?: PaymentMethod;

  @ApiProperty({
    description:
      `Filter to PENDING orders created more than ${PENDING_STALE_HOURS} hours ago — the ` +
      '"waiting too long" queue (TASK-425). Deliberately a SERVER filter reusing the ' +
      "dashboard's PENDING_STALE_HOURS, so the list chip and the dashboard tile cannot " +
      'drift apart.',
    example: true,
    required: false,
  })
  @IsOptional()
  // Same `obj`-reading guard as `unpaidInTransit` above: `enableImplicitConversion`
  // coerces the raw string first, and `Boolean('false')` is `true`.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'pendingOverdue must be true or false' })
  pendingOverdue?: boolean;

  /**
   * ── The derived-mark filters (TASK-470 / 471) ──────────────────────────────
   *
   * Four booleans rather than one `?mark=` enum, because they are independent
   * predicates and an operator legitimately asks for two at once ("delivered,
   * unpaid AND missing a position"). Each is the EXACT condition of the mark it
   * names in the B-1 catalogue, evaluated server-side — a client-side filter
   * over the current page would silently answer "how many on this page", which
   * is the wrong number every time the list is longer than one page.
   *
   * All four carry the same `obj`-reading `@Transform` as `unpaidInTransit`:
   * `enableImplicitConversion` coerces the raw string first and
   * `Boolean('false')` is `true`, so turning a chip OFF would turn it on.
   */

  @ApiProperty({
    description:
      'Filter to orders carrying a debt — status = DELIVERED AND paymentStatus NOT IN ' +
      '(PAID, REFUNDED). The «Борг N ₴» mark (TASK-470 / B-1): delivered goods nobody has ' +
      'paid for.',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'hasDebt must be true or false' })
  hasDebt?: boolean;

  @ApiProperty({
    description:
      'Filter to card orders still within their payment window — paymentMethod = ONLINE AND ' +
      'paymentStatus = PENDING AND reservationExpiresAt in the future. The ' +
      '«Очікує оплати · N хв» mark (TASK-471).',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'awaitingPayment must be true or false' })
  awaitingPayment?: boolean;

  @ApiProperty({
    description:
      'Filter to card orders whose payment window has closed — the same triple as ' +
      '`awaitingPayment` with `reservationExpiresAt` in the past. The «Резерв сплив» mark ' +
      '(TASK-471). Deliberately a separate flag, not a tri-state: the two are opposite ' +
      'answers to the same question and an operator acts differently on each.',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'reservationExpired must be true or false' })
  reservationExpired?: boolean;

  @ApiProperty({
    description:
      'Filter to open orders holding at least one line that can no longer be supplied — the ' +
      'product is deleted, unpublished or oversold, or the order lost its reservation to the ' +
      'TTL worker (TASK-470). Deep-link target of the dashboard «Недоступні позиції» tile, ' +
      'and the same predicate it counts.',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'hasUnavailableItems must be true or false' })
  hasUnavailableItems?: boolean;
}

/**
 * Query parameters for the admin order CSV export (TASK-425).
 *
 * The SAME filters as the list, minus pagination and sorting — the export is
 * "what I am currently looking at", not "this page of it", and a spreadsheet
 * sorts better than we do. Declared by subtraction from
 * {@link AdminOrderListQueryDto} rather than re-listed, so a filter added to the
 * list is exported by construction instead of by remembering to.
 *
 * The row cap is NOT a query parameter: it is the server's own memory guard, and
 * a caller raising it is exactly what the guard exists to prevent (see
 * `ORDER_EXPORT_MAX_ROWS` in the service).
 */
export class AdminOrderExportQueryDto extends OmitType(AdminOrderListQueryDto, [
  'page',
  'limit',
  'sortBy',
  'sortOrder',
] as const) {}
