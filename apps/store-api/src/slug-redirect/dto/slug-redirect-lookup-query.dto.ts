import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SlugRedirectEntity } from '@prisma/client';

/**
 * Query DTO for the public slug-redirect lookup (TASK-285-D).
 */
export class SlugRedirectLookupQueryDto {
  @ApiProperty({
    description: 'Content model the dead slug belongs to',
    enum: SlugRedirectEntity,
    example: SlugRedirectEntity.PAGE,
  })
  @IsEnum(SlugRedirectEntity, {
    message: `entity must be one of: ${Object.values(SlugRedirectEntity).join(', ')}`,
  })
  entity!: SlugRedirectEntity;

  @ApiProperty({
    description: 'The old (dead) slug to resolve',
    example: 'stara-adresa',
    maxLength: 255,
  })
  @IsString({ message: 'slug must be a string' })
  @IsNotEmpty({ message: 'slug must not be empty' })
  @MaxLength(255, { message: 'slug must be at most 255 characters' })
  slug!: string;

  /**
   * TASK-566 — the namespace of the dead address. Pages live under two routes,
   * and `/legal/delivery` and `/info/delivery` may be two different pages, so a
   * PAGE lookup names the kind whose route was requested. Omitted for every
   * single-namespace entity.
   */
  @ApiPropertyOptional({
    description:
      'Namespace of the dead address — for PAGE the page kind (LEGAL / INFO) whose route was requested. Omit for other entities.',
    example: 'LEGAL',
    maxLength: 32,
  })
  @IsOptional()
  @IsString({ message: 'scope must be a string' })
  @Matches(/^[A-Z][A-Z_]{0,31}$/, {
    message: 'scope must be an upper-case namespace token of at most 32 characters',
  })
  scope?: string;
}
