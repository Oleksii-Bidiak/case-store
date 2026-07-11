import {
  IsEnum,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AddonDeltaType } from '@prisma/client';

/**
 * Cross-field rule for a delta's `price` (TASK-174):
 *
 *   - `OVERRIDE` — `price` is REQUIRED (an override with no price is meaningless).
 *   - `ADD`      — `price` is OPTIONAL (absent = use the catalog price).
 *   - `REMOVE`   — `price` must be ABSENT (the column is ignored for REMOVE; a
 *                  client sending one has misunderstood the operation, so it is
 *                  rejected loudly rather than silently dropped).
 *
 * The numeric checks live INSIDE this constraint rather than as sibling
 * `@IsNumber()`/`@Min()` decorators: `@IsOptional()` would short-circuit the
 * whole property (so a missing OVERRIDE price would slip through), and
 * `@ValidateIf()` gates every decorator on the property at once — neither can
 * express three mutually exclusive branches. One constraint, all four rules.
 */
@ValidatorConstraint({ name: 'addonDeltaPrice', async: false })
export class AddonDeltaPriceConstraint implements ValidatorConstraintInterface {
  validate(price: unknown, args: ValidationArguments): boolean {
    const { type } = args.object as { type?: AddonDeltaType };
    const absent = price === undefined || price === null;

    if (type === AddonDeltaType.REMOVE) return absent;
    if (type === AddonDeltaType.OVERRIDE && absent) return false;
    if (absent) return true; // ADD without an explicit price — use the catalog price.

    return typeof price === 'number' && Number.isFinite(price) && price >= 0;
  }

  defaultMessage(args: ValidationArguments): string {
    const { type } = args.object as { type?: AddonDeltaType };
    if (type === AddonDeltaType.REMOVE) return 'price must not be set for a REMOVE delta';
    if (type === AddonDeltaType.OVERRIDE) {
      return 'price is required for an OVERRIDE delta and must be a non-negative number';
    }
    return 'price must be a non-negative number';
  }
}

/**
 * DTO for upserting ONE per-product add-on delta (admin-only, TASK-174).
 */
export class SetProductDeltaDto {
  @ApiProperty({
    description:
      'ADD = a service exclusive to this product; REMOVE = suppress an inherited service; OVERRIDE = this product’s own price for an inherited service',
    enum: AddonDeltaType,
    example: AddonDeltaType.OVERRIDE,
  })
  @IsEnum(AddonDeltaType, { message: 'type must be one of: ADD, REMOVE, OVERRIDE' })
  type!: AddonDeltaType;

  @ApiProperty({
    description:
      'Effective price for this product. Required for OVERRIDE, optional for ADD (falls back to the catalog price), forbidden for REMOVE.',
    example: 1299,
    required: false,
  })
  @Type(() => Number)
  @Validate(AddonDeltaPriceConstraint)
  price?: number;
}
