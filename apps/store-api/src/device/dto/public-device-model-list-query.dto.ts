import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { DeviceModelListQueryDto } from './device-model-list-query.dto';

/**
 * Orders the public device-model list understands (TASK-1952 / TASK-2070).
 *
 * - `name` — alphabetical by model name.
 * - `popular` — by the number of compatible PUBLICLY VISIBLE products, most
 *   first, then by name: the picker's "popular models" tiles.
 *
 * Absent keeps the historical order (newest release year first, then name), so
 * every caller that predates the parameter reads exactly what it read before.
 */
export const DEVICE_MODEL_SORTS = ['name', 'popular'] as const;
export type DeviceModelSort = (typeof DEVICE_MODEL_SORTS)[number];

/**
 * Query of the PUBLIC `GET /device-models` only. `sort` lives here and not on the
 * shared {@link DeviceModelListQueryDto} so the admin model list does not grow a
 * parameter it would silently ignore.
 */
export class PublicDeviceModelListQueryDto extends DeviceModelListQueryDto {
  @ApiProperty({
    description:
      'List order. `name` — alphabetical; `popular` — by the number of compatible publicly ' +
      'visible products (desc), then name. Omitted — newest release year first, then name.',
    enum: DEVICE_MODEL_SORTS,
    enumName: 'DeviceModelSort',
    required: false,
    example: 'popular',
  })
  @IsOptional()
  @IsIn(DEVICE_MODEL_SORTS, { message: `sort must be one of: ${DEVICE_MODEL_SORTS.join(', ')}` })
  sort?: DeviceModelSort;
}
