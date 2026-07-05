import {
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  Min,
  Max,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for querying device models (TASK-190). Backs both the public cascade
 * (`GET /device-models?deviceBrandId=&search=`) and the admin paginated list.
 * The public endpoints ignore pagination beyond sensible caps and default to
 * active-only.
 */
export class DeviceModelListQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 50,
    required: false,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(200, { message: 'Limit must be at most 200' })
  limit?: number = 50;

  @ApiProperty({
    description: 'Filter by owning device brand ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Device brand ID must be a valid UUID' })
  deviceBrandId?: string;

  @ApiProperty({ description: 'Search by device model name', example: 'iphone', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;

  @ApiProperty({
    description: 'Filter by active status (defaults to active-only for public)',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not `value`: the global
  // ValidationPipe runs with `enableImplicitConversion: true`, which coerces the
  // raw string to Boolean BEFORE this transform (Boolean('false') === true).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
