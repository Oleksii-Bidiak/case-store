import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  ValidationError,
} from 'class-validator';
import { IsInternationalPhone } from '../validators';
import { ValidationFailedException } from '../filters/validation-failed.exception';
import {
  GLOBAL_VALIDATION_OPTIONS,
  createGlobalValidationPipe,
  toFieldErrors,
} from './global-validation.pipe';

/**
 * TASK-1984 (D3): the global pipe answers a 400 with a machine-readable
 * `fieldErrors` list next to the unchanged `message` array, so a client can put
 * the error under the field it is about instead of regex-matching English.
 */

class AddressFixture {
  @IsString()
  @IsInternationalPhone()
  phone!: string;
}

class ItemFixture {
  @IsInt()
  @Min(1)
  quantity!: number;
}

class OrderFixture {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested()
  @Type(() => AddressFixture)
  shippingAddress!: AddressFixture;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFixture)
  items!: ItemFixture[];
}

const BODY: ArgumentMetadata = { type: 'body', metatype: OrderFixture, data: '' };

const VALID = {
  email: 'ivan@example.com',
  name: 'Ivan',
  shippingAddress: { phone: '+380 50 111 2233' },
  items: [{ quantity: 1 }],
};

async function rejectionOf(pipe: ValidationPipe, body: unknown): Promise<unknown> {
  try {
    await pipe.transform(body, BODY);
  } catch (error) {
    return error;
  }
  throw new Error('expected the pipe to reject the body');
}

describe('global validation pipe (TASK-1984, D3)', () => {
  it('keeps the options main.ts has always used', () => {
    expect(GLOBAL_VALIDATION_OPTIONS).toEqual({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
  });

  it('throws a ValidationFailedException (still a BadRequestException)', async () => {
    const error = await rejectionOf(createGlobalValidationPipe(), { ...VALID, email: 'nope' });

    expect(error).toBeInstanceOf(ValidationFailedException);
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('flattens nested objects and arrays into dot paths, one entry per failed constraint', async () => {
    const error = (await rejectionOf(createGlobalValidationPipe(), {
      email: 'nope',
      name: '',
      shippingAddress: { phone: '050 111 2233 ccc' },
      items: [{ quantity: 1 }, { quantity: 0 }],
    })) as ValidationFailedException;

    expect(error.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'email', constraint: 'isEmail' },
        { field: 'name', constraint: 'isNotEmpty' },
        { field: 'shippingAddress.phone', constraint: 'isInternationalPhone' },
        { field: 'items.1.quantity', constraint: 'min' },
      ]),
    );
    expect(error.fieldErrors).toHaveLength(4);
  });

  it('reports a property the whitelist forbids as constraint whitelistValidation', async () => {
    const error = (await rejectionOf(createGlobalValidationPipe(), {
      ...VALID,
      role: 'ADMIN',
      shippingAddress: { phone: '+380 50 111 2233', extension: '5' },
    })) as ValidationFailedException;

    expect(error.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'role', constraint: 'whitelistValidation' },
        { field: 'shippingAddress.extension', constraint: 'whitelistValidation' },
      ]),
    );
  });

  it('keeps `message` exactly what the stock ValidationPipe produced', async () => {
    const body = {
      ...VALID,
      email: 'nope',
      role: 'ADMIN',
      shippingAddress: { phone: 'call me' },
      items: [{ quantity: 0 }],
    };

    const ours = (await rejectionOf(createGlobalValidationPipe(), body)) as BadRequestException;
    const stock = (await rejectionOf(
      new ValidationPipe(GLOBAL_VALIDATION_OPTIONS),
      body,
    )) as BadRequestException;

    expect(ours.getResponse()).toEqual(stock.getResponse());
  });

  it('accepts a valid body and returns the transformed instance', async () => {
    const result = await createGlobalValidationPipe().transform(VALID, BODY);

    expect(result).toBeInstanceOf(OrderFixture);
  });
});

describe('toFieldErrors', () => {
  it('lists every constraint key of a node and walks its children', () => {
    const tree = [
      Object.assign(new ValidationError(), {
        property: 'items',
        constraints: { isArray: 'items must be an array' },
        children: [
          Object.assign(new ValidationError(), {
            property: '0',
            children: [
              Object.assign(new ValidationError(), {
                property: 'quantity',
                constraints: { isInt: '…', min: '…' },
                children: [],
              }),
            ],
          }),
        ],
      }),
    ];

    expect(toFieldErrors(tree)).toEqual([
      { field: 'items', constraint: 'isArray' },
      { field: 'items.0.quantity', constraint: 'isInt' },
      { field: 'items.0.quantity', constraint: 'min' },
    ]);
  });

  it('returns an empty list for no errors', () => {
    expect(toFieldErrors([])).toEqual([]);
  });
});
