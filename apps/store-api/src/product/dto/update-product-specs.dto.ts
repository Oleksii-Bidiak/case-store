import { IsArray, IsString, IsOptional, IsUUID, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A single structured-spec value in the assignment payload (TASK-191). `value`
 * is always the canonical string form; `valueNumber` is an optional numeric
 * mirror for NUMBER-typed definitions (the server also derives it, so clients
 * may omit it).
 */
export class ProductSpecValueDto {
  @ApiProperty({
    description: 'The attribute definition this value fills in',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID(4, { message: 'definitionId must be a valid UUID' })
  definitionId!: string;

  @ApiProperty({ description: 'Value in canonical string form', example: 'Силікон' })
  @IsString()
  value!: string;

  @ApiProperty({
    description: 'Optional numeric mirror (NUMBER-typed definitions)',
    example: 20,
    type: Number,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  valueNumber?: number | null;
}

/**
 * DTO for `PUT /products/:id/specs` (admin-only). Replaces the product's FULL
 * structured-spec value set — omitted definitions are cleared.
 */
export class UpdateProductSpecsDto {
  @ApiProperty({ description: 'The full set of spec values', type: [ProductSpecValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecValueDto)
  specs!: ProductSpecValueDto[];
}
