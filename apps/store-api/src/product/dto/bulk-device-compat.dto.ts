import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * How a bulk compatibility write treats what the products already have (TASK-1955):
 * - `add` — union with the existing set (running it twice changes nothing);
 * - `remove` — drop exactly the named models, keep the rest;
 * - `replace` — the named models become the whole set; everything else is erased.
 */
export const BULK_COMPAT_MODES = ['add', 'remove', 'replace'] as const;
export type BulkCompatMode = (typeof BULK_COMPAT_MODES)[number];

/** Most series one request may name — a brand has a few dozen at most. */
export const MAX_BULK_COMPAT_SERIES = 100;
/** Longest series name accepted — `DeviceModel.series` is free text («iPhone 15»). */
export const MAX_SERIES_LENGTH = 100;

/**
 * Body of `PUT /api/admin/devices/compat/bulk` (TASK-1955): one compatibility change
 * for many products at once — «весь iPhone 15 на ці 30 чохлів».
 *
 * Models are named directly (`deviceModelIds`) and/or by series (`series`, expanded
 * server-side to every model of that series, active or not). After expansion at
 * least one model must remain; unknown product ids, model ids and series are a 400
 * before anything is written. Same id cap and duplicate guard as the other bulk
 * product endpoints (`bulk-product-color.dto.ts`), so they cannot drift.
 */
export class BulkDeviceCompatDto {
  @ApiProperty({
    description: 'Ids of the products whose compatibility changes.',
    type: [String],
    maxItems: MAX_REORDER_IDS,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  @ArrayUnique({ message: 'productIds must not contain duplicates' })
  @IsUUID('loose', { each: true, message: 'Each product id must be a valid UUID' })
  productIds!: string[];

  @ApiProperty({
    description:
      '`add` keeps what the products already have, `remove` drops only the named models, ' +
      '`replace` makes the named models the whole set.',
    enum: BULK_COMPAT_MODES,
    enumName: 'BulkCompatMode',
    example: 'add',
  })
  @IsIn(BULK_COMPAT_MODES)
  mode!: BulkCompatMode;

  @ApiProperty({
    description: 'Device model ids to add / remove / set.',
    type: [String],
    required: false,
    maxItems: MAX_REORDER_IDS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REORDER_IDS)
  @ArrayUnique({ message: 'deviceModelIds must not contain duplicates' })
  @IsUUID('loose', { each: true, message: 'Each device model id must be a valid UUID' })
  deviceModelIds?: string[];

  @ApiProperty({
    description:
      'Whole series («iPhone 15»): expanded to every model of that series, active or not.',
    type: [String],
    required: false,
    maxItems: MAX_BULK_COMPAT_SERIES,
    example: ['iPhone 15'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BULK_COMPAT_SERIES)
  @ArrayUnique({ message: 'series must not contain duplicates' })
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_SERIES_LENGTH, { each: true })
  series?: string[];
}
