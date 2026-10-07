import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PublishFieldsDto } from '../../publishing';
import { MAX_HOME_BLOCK_TABS } from './create-home-block.dto';

/** Trim leading/trailing whitespace from string inputs (leave non-strings as-is). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * DTO for editing a homepage block (TASK-661). All fields optional — only provided
 * fields are written. The type is not sent (it cannot change), so the service checks
 * each field against the STORED type: `carouselId` only for CAROUSEL, `title` / `tabs`
 * only for TABS (400 otherwise). `tabs` REPLACES the whole tab list, in the order
 * given. Publish control (show / draft / schedule) comes from {@link PublishFieldsDto}.
 */
export class UpdateHomeBlockDto extends PublishFieldsDto {
  @ApiProperty({
    description: 'Point a CAROUSEL block at another carousel (CAROUSEL only)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'carouselId must be a valid UUID' })
  carouselId?: string;

  @ApiProperty({
    description: 'Section heading (TABS only)',
    example: 'Аксесуари',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Title must not be empty' })
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title?: string;

  @ApiProperty({
    description: 'The complete new tab list, carousel ids in tab order (TABS only)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'A tabs block needs at least one tab' })
  @ArrayMaxSize(MAX_HOME_BLOCK_TABS)
  @ArrayUnique({ message: 'A carousel can be a tab of one block only once' })
  @IsUUID('loose', { each: true, message: 'Each tab must be a carousel UUID' })
  tabs?: string[];
}
