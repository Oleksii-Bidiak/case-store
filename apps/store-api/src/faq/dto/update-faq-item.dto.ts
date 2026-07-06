import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing FAQ item (admin-only).
 *
 * All fields are optional — only provided fields are written. Used both for
 * editing content and for toggling `isActive` / changing `sortOrder`.
 */
export class UpdateFaqItemDto {
  @ApiPropertyOptional({
    description: 'The question shown to the shopper',
    example: 'Скільки коштує доставка?',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Question must be at most 500 characters' })
  question?: string;

  @ApiPropertyOptional({
    description: 'The answer shown when the question is expanded',
    example: 'Доставка Новою Поштою — за тарифами перевізника.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Answer must be at most 5000 characters' })
  answer?: string;

  @ApiPropertyOptional({
    description: 'Display order (ascending). Lower numbers appear first.',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'sortOrder must be an integer' })
  @Min(0, { message: 'sortOrder must be zero or greater' })
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Whether the FAQ item is visible on the storefront',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
