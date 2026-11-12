import { ApiProperty } from '@nestjs/swagger';
import type { CompatScope } from '../my-devices.types';

/**
 * One saved device of the account (TASK-1959), enriched from its `DeviceModel`
 * and `DeviceBrand` so the storefront can render the chip and resolve the
 * device family (brand + series/name) without another request.
 */
export class MyDeviceEntity {
  @ApiProperty({ description: 'Device model ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  modelId!: string;

  @ApiProperty({ description: 'Device model slug', example: 'iphone-15-pro' })
  slug!: string;

  @ApiProperty({ description: 'Device model name', example: 'iPhone 15 Pro' })
  name!: string;

  @ApiProperty({ description: 'Device brand name', example: 'Apple' })
  brandName!: string;

  @ApiProperty({ description: 'Device brand slug', example: 'apple' })
  brandSlug!: string;

  @ApiProperty({
    description: 'Model series, used with the brand to resolve the device family',
    type: String,
    nullable: true,
    example: 'iPhone 15',
  })
  series!: string | null;

  @ApiProperty({ description: 'Owner’s note', type: String, nullable: true, example: 'Мама' })
  label!: string | null;

  @ApiProperty({
    description: 'Last add / activation; the list is ordered by it, newest (= active) first',
    example: '2026-11-01T10:00:00.000Z',
  })
  lastUsedAt!: Date;

  static fromPrisma(row: {
    deviceModelId: string;
    label: string | null;
    lastUsedAt: Date;
    deviceModel: {
      slug: string;
      name: string;
      series: string | null;
      brand: { name: string; slug: string };
    };
  }): MyDeviceEntity {
    const entity = new MyDeviceEntity();
    entity.modelId = row.deviceModelId;
    entity.slug = row.deviceModel.slug;
    entity.name = row.deviceModel.name;
    entity.brandName = row.deviceModel.brand.name;
    entity.brandSlug = row.deviceModel.brand.slug;
    entity.series = row.deviceModel.series;
    entity.label = row.label;
    entity.lastUsedAt = row.lastUsedAt;
    return entity;
  }
}

/** The settings panel of «Мої пристрої» — the catalogue filter defaults. */
export class MyDevicesSettingsEntity {
  @ApiProperty({ description: '«У каталозі — лише сумісне»', example: true })
  compatOnly!: boolean;

  @ApiProperty({
    description: 'Filter for the active device or for all saved devices',
    enum: ['active', 'all'],
    enumName: 'DeviceCompatScope',
    example: 'active',
  })
  compatScope!: CompatScope;
}

/** `GET / PUT /me/devices` and `POST /me/devices/merge` payload. */
export class MyDevicesStateEntity {
  @ApiProperty({
    description: 'Saved devices, newest first; the first is the active device',
    type: [MyDeviceEntity],
  })
  devices!: MyDeviceEntity[];

  @ApiProperty({ type: MyDevicesSettingsEntity })
  settings!: MyDevicesSettingsEntity;
}
