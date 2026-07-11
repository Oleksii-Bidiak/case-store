import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
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
  })
  @IsString({ message: 'slug must be a string' })
  @IsNotEmpty({ message: 'slug must not be empty' })
  slug!: string;
}
