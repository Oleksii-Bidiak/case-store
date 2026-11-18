import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateManualOrderDto } from './create-manual-order.dto';

/**
 * R2 A3 (TASK-2047): the operator's phone order accepts «Переказ на рахунок ФОП»
 * — the storefront's `CreateOrderDto` refuses it (see its spec).
 */
describe('CreateManualOrderDto — payment method', () => {
  const paymentErrors = (paymentMethod: unknown) =>
    validateSync(plainToInstance(CreateManualOrderDto, { paymentMethod })).filter(
      (error) => error.property === 'paymentMethod',
    );

  it.each(['ON_DELIVERY', 'ONLINE', 'INSTALLMENTS', 'BANK_TRANSFER'])('accepts %s', (method) => {
    expect(paymentErrors(method)).toEqual([]);
  });

  it('refuses an unknown method', () => {
    expect(paymentErrors('CRYPTO')).not.toEqual([]);
  });
});

/** TASK-1973 / TASK-1019: the operator chooses how the order is delivered. */
describe('CreateManualOrderDto — delivery', () => {
  const errorsFor = (property: string, value: unknown) =>
    validateSync(plainToInstance(CreateManualOrderDto, { [property]: value })).filter(
      (error) => error.property === property,
    );

  it.each(['NOVA_POSHTA', 'PICKUP', 'COURIER', 'OTHER'])('accepts deliveryMethod %s', (m) => {
    expect(errorsFor('deliveryMethod', m)).toEqual([]);
  });

  it('refuses an unknown delivery method', () => {
    expect(errorsFor('deliveryMethod', 'DRONE')).not.toEqual([]);
  });

  it('accepts a pickup point uuid and refuses garbage', () => {
    expect(errorsFor('pickupPointId', '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11')).toEqual([]);
    expect(errorsFor('pickupPointId', 'not-a-uuid')).not.toEqual([]);
  });

  it.each([0, 150, 99.5, 120.25])('accepts an agreed shipping cost of %p', (cost) => {
    expect(errorsFor('shippingCost', cost)).toEqual([]);
  });

  it.each([-1, 1.005, 100001, '150', Number.NaN])('refuses shipping cost %p', (cost) => {
    expect(errorsFor('shippingCost', cost)).not.toEqual([]);
  });

  // Verifier: `@IsOptional` let null through — an OTHER order was then booked
  // at 0 ₴ WITHOUT the «to be quoted» flag. Absent means «to be quoted»; null
  // is not a cost.
  it('refuses a null shipping cost (omit the field instead)', () => {
    expect(errorsFor('shippingCost', null)).not.toEqual([]);
  });

  it('leaves the shipping cost optional when absent', () => {
    expect(errorsFor('shippingCost', undefined)).toEqual([]);
  });
});

/** TASK-2048: «Створити копію» — the original, and whether it is cancelled with it. */
describe('CreateManualOrderDto — copy of an order', () => {
  const SOURCE = '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11';
  const errorsFor = (body: Record<string, unknown>, property: string) =>
    validateSync(plainToInstance(CreateManualOrderDto, body)).filter(
      (error) => error.property === property,
    );

  it('accepts a copy, with or without the cancel of the original', () => {
    expect(errorsFor({ copyOfOrderId: SOURCE }, 'copyOfOrderId')).toEqual([]);
    expect(errorsFor({ copyOfOrderId: SOURCE, cancelOriginal: true }, 'cancelOriginal')).toEqual(
      [],
    );
    expect(errorsFor({ copyOfOrderId: SOURCE, cancelOriginal: false }, 'cancelOriginal')).toEqual(
      [],
    );
  });

  it('refuses an original that is not a uuid', () => {
    expect(errorsFor({ copyOfOrderId: 'order-1' }, 'copyOfOrderId')).not.toEqual([]);
  });

  it('refuses a non-boolean cancel', () => {
    expect(
      errorsFor({ copyOfOrderId: SOURCE, cancelOriginal: 'yes' }, 'cancelOriginal'),
    ).not.toEqual([]);
  });

  it('refuses «cancel the original» with no original named', () => {
    expect(errorsFor({ cancelOriginal: true }, 'cancelOriginal')).not.toEqual([]);
  });

  it('leaves both optional — an ordinary phone order', () => {
    expect(errorsFor({}, 'copyOfOrderId')).toEqual([]);
    expect(errorsFor({}, 'cancelOriginal')).toEqual([]);
  });
});
