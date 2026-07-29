import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * The operator's review decisions, posted with the confirmation (TASK-360).
 *
 * Both fields are OPT-OUTS. The owner's rule is that the supplier file wins by
 * default, so an empty body means "apply the plan as shown"; the payload only
 * ever carries what the operator actively unticked. On a 1300-row run that is
 * the difference between a few hundred bytes and a few hundred kilobytes.
 */
export class ApplyImportDto {
  @ApiProperty({
    description: 'Supplier article numbers to skip entirely',
    example: ['614510003'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedSkus?: string[];

  @ApiProperty({
    description:
      'Per-article field names to leave untouched. Keys are article numbers, ' +
      'values are field names from the plan (e.g. "price", "description").',
    example: { '614510003': ['price'] },
    required: false,
    // TASK-304: @nestjs/swagger 11 dropped the 'object' string literal from
    // ApiPropertyOptions['type']; the Object constructor emits the same schema.
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  @IsOptional()
  @IsObject()
  excludedFields?: Record<string, string[]>;
}
