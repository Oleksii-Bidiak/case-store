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
});
