import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
  Matches,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttributeType } from '@prisma/client';
import { ATTRIBUTE_KEY_PATTERN } from '../attribute-definition.constants';

/**
 * DTO for creating a structured-spec template on a category (admin-only).
 * The `categoryId` comes from the route param, not the body.
 */
export class CreateAttributeDefinitionDto {
  @ApiProperty({
    description: 'Stable, filter-safe key (kebab or camel, no spaces)',
    example: 'material',
  })
  @IsString()
  @MaxLength(60, { message: 'Key must be at most 60 characters' })
  @Matches(ATTRIBUTE_KEY_PATTERN, {
    message: 'Key must start with a letter and contain only letters, digits, or hyphens',
  })
  key!: string;

  @ApiProperty({ description: 'Human-readable label', example: 'Матеріал' })
  @IsString()
  @MaxLength(120, { message: 'Label must be at most 120 characters' })
  label!: string;

  @ApiProperty({
    description: 'Value data type',
    enum: AttributeType,
    example: AttributeType.SELECT,
    required: false,
    default: AttributeType.TEXT,
  })
  @IsOptional()
  @IsEnum(AttributeType, { message: 'type must be one of: TEXT, NUMBER, BOOLEAN, SELECT' })
  type?: AttributeType = AttributeType.TEXT;

  @ApiProperty({
    description: 'Optional unit suffix appended on render',
    example: 'W',
    type: String,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Unit must be at most 20 characters' })
  unit?: string | null;

  @ApiProperty({
    description: 'Allowed values (required and non-empty when type is SELECT)',
    example: ['Силікон', 'Шкіра'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Each option must be a string' })
  options?: string[];

  @ApiProperty({
    description: 'Whether this spec is surfaced as a catalog facet + PDP highlight',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean = false;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
