import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { ReorderFlatDto } from '../../common/dto';
import { PickupPointPublicDto } from './delivery-methods.dto';

/**
 * Admin payloads and responses for the pickup-point CRUD (TASK-645).
 *
 * ── Field rules ─────────────────────────────────────────────────────────────
 * - `name`, `city`, `address` are NOT NULL columns and are what an order
 *   snapshots, so they are trimmed and must not be empty. On create they are
 *   required; on update they are validated whenever PRESENT — `null` included,
 *   which must be a 400 rather than a Prisma error.
 * - `phone`, `workingHours`, `mapUrl` are nullable. A blank string (what an
 *   admin form sends for a cleared input) is stored as null, so the checkout
 *   never renders an empty "Телефон:" row.
 * - `mapUrl` must be an http(s) URL — it becomes a link on the storefront, and
 *   a `javascript:` value there is an XSS vector, not a typo.
 * - `isActive` reads the RAW body value, like `UpdateDeliverySettingDto`'s
 *   flags: the global pipe's `enableImplicitConversion` would otherwise turn any
 *   non-empty string ("false") into `true` before `IsBoolean` saw it.
 */

/** Trim a string; leave anything else for the validators to reject. */
function trimmed({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trim a string and collapse a blank one to null (a cleared optional input). */
function trimmedOrNull({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
}

/** Read the untouched body value, bypassing implicit type conversion. */
function rawValue({ obj, key }: TransformFnParams): unknown {
  return (obj as Record<string, unknown>)[key];
}

const NAME_MAX = 255;
const CITY_MAX = 255;
const ADDRESS_MAX = 500;
const PHONE_MAX = 50;
const HOURS_MAX = 255;
const MAP_URL_MAX = 2048;

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

export class CreatePickupPointDto {
  @ApiProperty({ description: 'Point name shown at checkout', example: 'Магазин на Хрещатику' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX)
  name!: string;

  @ApiProperty({ example: 'Київ' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CITY_MAX)
  city!: string;

  @ApiProperty({ example: 'вул. Хрещатик, 1' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ADDRESS_MAX)
  address!: string;

  @ApiPropertyOptional({
    description: 'Free-form phone; blank or null = none',
    type: String,
    nullable: true,
    example: '+380441234567',
  })
  @Transform(trimmedOrNull)
  @ValidateIf((o: CreatePickupPointDto) => o.phone !== undefined && o.phone !== null)
  @IsString()
  @MaxLength(PHONE_MAX)
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'Free text, shown as typed; blank or null = none',
    type: String,
    nullable: true,
    example: 'Пн–Пт 10:00–19:00',
  })
  @Transform(trimmedOrNull)
  @ValidateIf((o: CreatePickupPointDto) => o.workingHours !== undefined && o.workingHours !== null)
  @IsString()
  @MaxLength(HOURS_MAX)
  workingHours?: string | null;

  @ApiPropertyOptional({
    description: 'Map link (http/https only); blank or null = none',
    type: String,
    nullable: true,
    example: 'https://maps.app.goo.gl/abc',
  })
  @Transform(trimmedOrNull)
  @ValidateIf((o: CreatePickupPointDto) => o.mapUrl !== undefined && o.mapUrl !== null)
  @IsUrl(URL_OPTIONS, { message: 'mapUrl must be an http(s) URL' })
  @MaxLength(MAP_URL_MAX)
  mapUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Shown at checkout. Defaults to true.',
    example: true,
    default: true,
  })
  @ValidateIf((o: CreatePickupPointDto) => o.isActive !== undefined)
  @Transform(rawValue)
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}

/**
 * Partial update — send only what changes. Required-on-create fields are
 * validated whenever present (`null` → 400), see the module comment above.
 */
export class UpdatePickupPointDto {
  @ApiPropertyOptional({ example: 'Магазин на Хрещатику', maxLength: NAME_MAX })
  @Transform(trimmed)
  @ValidateIf((o: UpdatePickupPointDto) => o.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ example: 'Київ', maxLength: CITY_MAX })
  @Transform(trimmed)
  @ValidateIf((o: UpdatePickupPointDto) => o.city !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CITY_MAX)
  city?: string;

  @ApiPropertyOptional({ example: 'вул. Хрещатик, 1', maxLength: ADDRESS_MAX })
  @Transform(trimmed)
  @ValidateIf((o: UpdatePickupPointDto) => o.address !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ADDRESS_MAX)
  address?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+380441234567' })
  @Transform(trimmedOrNull)
  @ValidateIf((o: UpdatePickupPointDto) => o.phone !== undefined && o.phone !== null)
  @IsString()
  @MaxLength(PHONE_MAX)
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Пн–Пт 10:00–19:00' })
  @Transform(trimmedOrNull)
  @ValidateIf((o: UpdatePickupPointDto) => o.workingHours !== undefined && o.workingHours !== null)
  @IsString()
  @MaxLength(HOURS_MAX)
  workingHours?: string | null;

  @ApiPropertyOptional({
    description: 'Map link (http/https only); blank or null clears it',
    type: String,
    nullable: true,
    example: 'https://maps.app.goo.gl/abc',
  })
  @Transform(trimmedOrNull)
  @ValidateIf((o: UpdatePickupPointDto) => o.mapUrl !== undefined && o.mapUrl !== null)
  @IsUrl(URL_OPTIONS, { message: 'mapUrl must be an http(s) URL' })
  @MaxLength(MAP_URL_MAX)
  mapUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Shown at checkout. False hides it; existing orders keep their snapshot.',
    example: false,
  })
  @ValidateIf((o: UpdatePickupPointDto) => o.isActive !== undefined)
  @Transform(rawValue)
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}

/**
 * Body of `PATCH /api/admin/pickup-points/reorder`. Adds nothing to
 * {@link ReorderFlatDto}; it exists so the generated OpenAPI schema (and the
 * Orval payload type) is named for THIS list — see `ReorderFaqItemsDto`.
 */
export class ReorderPickupPointsDto extends ReorderFlatDto {}

/** A pickup point as the admin screen sees it (TASK-645). */
export class AdminPickupPointDto extends PickupPointPublicDto {
  @ApiProperty({ description: 'Shown at checkout', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Position in the list (0-based, ascending)', example: 0 })
  sortOrder!: number;

  @ApiProperty({
    description:
      'Orders that reference this point. Deleting it keeps them (their snapshot keeps the ' +
      'name and address) but unlinks them — deactivating is the usual move.',
    example: 3,
  })
  ordersCount!: number;
}

/**
 * Envelope shared by the list and the reorder — the reorder answers with the
 * full refreshed list so the admin panel resyncs in one round-trip, and the two
 * must be interchangeable in its query cache.
 */
export class AdminPickupPointListResponse {
  @ApiProperty({ type: [AdminPickupPointDto], description: 'Every point, inactive included' })
  data!: AdminPickupPointDto[];
}

/** Envelope for one point (create, update). */
export class AdminPickupPointResponse {
  @ApiProperty({ type: AdminPickupPointDto })
  data!: AdminPickupPointDto;
}

class DeletedPickupPointId {
  @ApiProperty({ format: 'uuid', description: 'ID of the deleted point' })
  id!: string;
}

/** Envelope for a delete. */
export class DeletePickupPointResponse {
  @ApiProperty({ type: DeletedPickupPointId })
  data!: DeletedPickupPointId;
}
