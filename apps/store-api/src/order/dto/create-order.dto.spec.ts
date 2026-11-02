import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { CreateOrderDto } from './create-order.dto';

/**
 * TASK-2047 (R2): BANK_TRANSFER («Переказ на рахунок ФОП») is an admin-only
 * method. The storefront checkout accepts an allow-list, so a new method never
 * reaches customers by default just because the enum grew.
 */
async function paymentMethodErrors(paymentMethod: unknown): Promise<string[]> {
  const dto = plainToInstance(CreateOrderDto, { paymentMethod });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'paymentMethod').map((e) => e.property);
}

describe('CreateOrderDto — paymentMethod allow-list (TASK-2047)', () => {
  it.each([PaymentMethod.ON_DELIVERY, PaymentMethod.ONLINE, PaymentMethod.INSTALLMENTS])(
    'accepts %s',
    async (method) => {
      expect(await paymentMethodErrors(method)).toEqual([]);
    },
  );

  it('accepts an omitted method (defaults to ON_DELIVERY)', async () => {
    expect(await paymentMethodErrors(undefined)).toEqual([]);
  });

  it('refuses BANK_TRANSFER — admin-only', async () => {
    expect(await paymentMethodErrors(PaymentMethod.BANK_TRANSFER)).toEqual(['paymentMethod']);
  });

  it('refuses an unknown value', async () => {
    expect(await paymentMethodErrors('CRYPTO')).toEqual(['paymentMethod']);
  });
});
