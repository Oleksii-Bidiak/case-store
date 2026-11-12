import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_DEVICE_LABEL_LENGTH, MAX_MY_DEVICES } from '../my-devices.constants';
import type { CompatScope } from '../my-devices.types';

const COMPAT_SCOPES: readonly CompatScope[] = ['active', 'all'];

/** One device of the list the storefront sends (TASK-1959). */
export class MyDeviceInputDto {
  @ApiProperty({
    description: 'Device model ID. Unknown or inactive models are dropped silently.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('loose', { message: 'modelId must be a valid UUID' })
  modelId!: string;

  @ApiProperty({
    description: 'Owner’s note («Мама»); blank or absent = no label.',
    type: String,
    nullable: true,
    required: false,
    maxLength: MAX_DEVICE_LABEL_LENGTH,
    example: 'Мама',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DEVICE_LABEL_LENGTH)
  label?: string | null;

  @ApiProperty({
    description: 'Last add / activation (ISO 8601). The latest one is the active device.',
    example: '2026-11-01T10:00:00.000Z',
  })
  @IsISO8601({ strict: true })
  lastUsedAt!: string;
}

/** The «Мої пристрої» settings panel — the catalogue filter defaults (TASK-2077). */
export class MyDevicesSettingsDto {
  @ApiProperty({ description: '«У каталозі — лише сумісне»', example: true })
  // The RAW value: with `enableImplicitConversion` the string "false" would
  // become `true` and silently turn the filter on.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  compatOnly!: boolean;

  @ApiProperty({
    description: 'Filter for the active device or for all saved devices',
    enum: COMPAT_SCOPES,
    enumName: 'DeviceCompatScope',
    example: 'active',
  })
  @IsIn(COMPAT_SCOPES)
  compatScope!: CompatScope;
}

/**
 * Body of `PUT /me/devices` (full replace) and `POST /me/devices/merge` (guest
 * state pushed in after sign-in). The user is ALWAYS the token subject — there
 * is deliberately no `userId` here, and the global `forbidNonWhitelisted` pipe
 * refuses one.
 */
export class MyDevicesDto {
  @ApiProperty({ type: [MyDeviceInputDto], maxItems: MAX_MY_DEVICES })
  @IsArray()
  @ArrayMaxSize(MAX_MY_DEVICES)
  @ValidateNested({ each: true })
  @Type(() => MyDeviceInputDto)
  devices!: MyDeviceInputDto[];

  @ApiProperty({ type: MyDevicesSettingsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MyDevicesSettingsDto)
  settings!: MyDevicesSettingsDto;
}
