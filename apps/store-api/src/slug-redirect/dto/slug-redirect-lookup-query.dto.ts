import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
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
}
