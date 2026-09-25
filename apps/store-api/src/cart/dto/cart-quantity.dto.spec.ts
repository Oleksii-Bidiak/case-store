import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_QUANTITY } from '../../common/constants';
import { AddToCartDto } from './add-to-cart.dto';
import { UpdateCartItemDto } from './update-cart-item.dto';

/**
 * The two cart-quantity DTOs (TASK-823).
 *
 * Their upper bound used to be a literal `@Max(99)` beside a `MAX_QUANTITY` that
 * the service, the cart entity's `maxQty` and the wishlist all read — two sources
 * of one number, agreeing only by coincidence. Raise the cap and the DTO would
 * keep answering 400 at 100 while the storefront's stepper offered 150.
 */

type QuantityDto = typeof AddToCartDto | typeof UpdateCartItemDto;

const VALID_PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

function bodyFor(dto: QuantityDto, quantity: unknown): Record<string, unknown> {
  return dto === AddToCartDto ? { productId: VALID_PRODUCT_ID, quantity } : { quantity };
}

function quantityErrors(dto: QuantityDto, quantity: unknown): string[] {
  const errors = validateSync(plainToInstance(dto, bodyFor(dto, quantity)));
  return errors
    .filter((e) => e.property === 'quantity')
    .flatMap((e) => Object.keys(e.constraints ?? {}));
}

/** The `@ApiProperty` options recorded for a property (what swagger:export reads). */
function apiPropertyOf(dto: QuantityDto, property: string): Record<string, unknown> {
  return Reflect.getMetadata('swagger/apiModelProperties', dto.prototype, property) as Record<
    string,
    unknown
  >;
}

describe.each([
  ['AddToCartDto', AddToCartDto],
  ['UpdateCartItemDto', UpdateCartItemDto],
] as const)('%s.quantity', (_name, dto) => {
  it('accepts 1 and MAX_QUANTITY', () => {
    expect(quantityErrors(dto, 1)).toEqual([]);
    expect(quantityErrors(dto, MAX_QUANTITY)).toEqual([]);
  });

  it('refuses 0 and MAX_QUANTITY + 1', () => {
    expect(quantityErrors(dto, 0)).toContain('min');
    expect(quantityErrors(dto, MAX_QUANTITY + 1)).toContain('max');
  });

  it('is required — an omitted quantity is a 400, never a silent 1', () => {
    expect(quantityErrors(dto, undefined)).not.toEqual([]);
  });

  it('documents the same bounds it enforces, and promises no default', () => {
    const doc = apiPropertyOf(dto, 'quantity');

    expect(doc).toMatchObject({ minimum: 1, maximum: MAX_QUANTITY });
    expect(doc.required).not.toBe(false);
    expect(doc).not.toHaveProperty('default');
  });
});

describe('the cap follows MAX_QUANTITY rather than a literal', () => {
  // Re-load both DTOs against a different cap. A literal `@Max(99)` would still
  // accept 6; a DTO bound to the constant refuses it.
  const withCap = (cap: number) => {
    let loaded: { AddToCartDto: QuantityDto; UpdateCartItemDto: QuantityDto } | undefined;
    jest.isolateModules(() => {
      jest.doMock('../../common/constants/quantity.constants', () => ({ MAX_QUANTITY: cap }));
      // A fresh load is the point — the decorators read the cap at class definition.
      /* eslint-disable @typescript-eslint/no-require-imports */
      const add = require('./add-to-cart.dto') as { AddToCartDto: QuantityDto };
      const update = require('./update-cart-item.dto') as { UpdateCartItemDto: QuantityDto };
      /* eslint-enable @typescript-eslint/no-require-imports */
      loaded = { AddToCartDto: add.AddToCartDto, UpdateCartItemDto: update.UpdateCartItemDto };
    });
    jest.dontMock('../../common/constants/quantity.constants');
    return loaded!;
  };

  it.each(['AddToCartDto', 'UpdateCartItemDto'] as const)(
    '%s refuses 6 when the cap is 5',
    (name) => {
      const Dto = withCap(5)[name];
      const body =
        name === 'AddToCartDto' ? { productId: VALID_PRODUCT_ID, quantity: 6 } : { quantity: 6 };

      const errors = validateSync(plainToInstance(Dto, body));

      expect(errors.find((e) => e.property === 'quantity')?.constraints).toHaveProperty('max');
    },
  );
});
