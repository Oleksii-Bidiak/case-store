import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new FAQ item (admin-only).
 *
 * `sortOrder` defaults to 0 and `isActive` to true when omitted (the repository
 * applies the defaults). Length limits mirror the storefront copy — questions
 * are one-liners, answers a short paragraph.
 */
export class CreateFaqItemDto {
  @ApiProperty({
    description: 'The question shown to the shopper',
    example: 'Скільки коштує доставка?',
  })
  @IsString()
  @MaxLength(500, { message: 'Question must be at most 500 characters' })
  question!: string;

  @ApiProperty({
    description: 'The answer shown when the question is expanded',
    example: 'Доставка Новою Поштою — за тарифами перевізника.',
  })
  @IsString()
  @MaxLength(5000, { message: 'Answer must be at most 5000 characters' })
  answer!: string;

  @ApiPropertyOptional({
    description: 'Display order (ascending). Lower numbers appear first.',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'sortOrder must be an integer' })
  @Min(0, { message: 'sortOrder must be zero or greater' })
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Whether the FAQ item is visible on the storefront',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
