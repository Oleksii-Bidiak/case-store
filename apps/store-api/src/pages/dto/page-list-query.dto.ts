import { IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query DTO for the public page list (published pages only).
 */
export class PageListQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 20;
}

/**
 * Query DTO for the admin page list (published + drafts), with an optional
 * isActive filter.
 */
export class AdminPageListQueryDto extends PageListQueryDto {
  @ApiProperty({
    description: 'Filter by published status (true = published, false = drafts)',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the coerced `value`. The global
  // ValidationPipe runs with `enableImplicitConversion: true`, which coerces the raw
  // string to Boolean BEFORE this transform — and `Boolean('false')` is `true`.
  // Deriving from `obj[key]` (the untouched string) is the only reliable way.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
