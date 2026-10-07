import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { PreviewScopeType } from '../preview-token.util';

export const PREVIEW_TOKEN_TYPES = ['home', 'product', 'page', 'post'] as const;

/**
 * Body of `POST /api/admin/preview-tokens` (TASK-668): what to preview. `id` is the
 * product / page / blog-post id, required for everything except `home`.
 */
export class CreatePreviewTokenDto {
  @ApiProperty({ enum: PREVIEW_TOKEN_TYPES, enumName: 'PreviewTokenType', example: 'home' })
  @IsIn(PREVIEW_TOKEN_TYPES)
  type!: PreviewScopeType;

  @ApiProperty({
    description: 'Product / page / blog-post id — required unless type = home',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('loose', { message: 'id must be a valid UUID' })
  id?: string;
}
