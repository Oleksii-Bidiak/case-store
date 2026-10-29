import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { HomeBlockType } from '@prisma/client';
import { CREATABLE_HOME_BLOCK_TYPES, type CreatableHomeBlockType } from '../home-block.rules';
import { OnlyForBlockType } from './only-for-block-type.validator';
import { HomeBlockPublishFieldsDto, whenSent } from './home-block-publish-fields.dto';

/** Trim leading/trailing whitespace from string inputs (leave non-strings as-is). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** A generous bound: a section with more than 20 tabs is not a section anyone reads. */
export const MAX_HOME_BLOCK_TABS = 20;

/**
 * DTO for adding a block to the homepage (TASK-661). Only CAROUSEL and TABS can be
 * created — the singleton blocks (slider, trust strip, categories, promo banner,
 * «Ви переглядали», newsletter) come from the migration and can only be hidden,
 * scheduled or moved.
 *
 *   - CAROUSEL: `carouselId` required; `title` / `tabs` rejected.
 *   - TABS: `title` + `tabs` (carousel ids, in tab order) required; `carouselId`
 *     rejected.
 *
 * Publish control comes from {@link HomeBlockPublishFieldsDto} — show now / draft /
 * schedule. `null` is a 400 on every field, never "absent".
 */
export class CreateHomeBlockDto extends HomeBlockPublishFieldsDto {
  @ApiProperty({
    description: 'Block type — only CAROUSEL and TABS can be created',
    enum: CREATABLE_HOME_BLOCK_TYPES,
    example: HomeBlockType.CAROUSEL,
  })
  @IsIn(CREATABLE_HOME_BLOCK_TYPES, {
    message: `type must be one of: ${CREATABLE_HOME_BLOCK_TYPES.join(', ')}`,
  })
  type!: CreatableHomeBlockType;

  @ApiProperty({
    description: 'The carousel a CAROUSEL block shows — required for CAROUSEL, rejected otherwise',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @ValidateIf(
    (o: CreateHomeBlockDto) => o.type === HomeBlockType.CAROUSEL || o.carouselId !== undefined,
  )
  @OnlyForBlockType(HomeBlockType.CAROUSEL)
  @IsUUID('loose', { message: 'carouselId must be a valid UUID' })
  carouselId?: string;

  @ApiProperty({
    description: 'Section heading shown above the tabs — required for TABS, rejected otherwise',
    example: 'Аксесуари',
    required: false,
  })
  @ValidateIf((o: CreateHomeBlockDto) => o.type === HomeBlockType.TABS || o.title !== undefined)
  @OnlyForBlockType(HomeBlockType.TABS)
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Title must not be empty' })
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title?: string;

  @ApiProperty({
    description:
      'Carousel ids of the tabs, in tab order (tab label = carousel title) — required for TABS, rejected otherwise',
    type: [String],
    required: false,
  })
  @ValidateIf((o: CreateHomeBlockDto) => o.type === HomeBlockType.TABS || o.tabs !== undefined)
  @OnlyForBlockType(HomeBlockType.TABS)
  @IsArray()
  @ArrayMinSize(1, { message: 'A tabs block needs at least one tab' })
  @ArrayMaxSize(MAX_HOME_BLOCK_TABS)
  @ArrayUnique({ message: 'A carousel can be a tab of one block only once' })
  @IsUUID('loose', { each: true, message: 'Each tab must be a carousel UUID' })
  tabs?: string[];

  @ApiProperty({
    description:
      'Where to insert the block: a 0-based index into the CURRENT page order (0 = the ' +
      'first block; the block now at that index and every one after it move down one). ' +
      'An index at or past the number of blocks, or no position at all, appends the ' +
      'block at the end. `null` is rejected.',
    example: 4,
    required: false,
  })
  @ValidateIf(whenSent)
  @Type(() => Number)
  @IsInt({ message: 'Position must be an integer' })
  @Min(0, { message: 'Position must be at least 0' })
  position?: number;
}
