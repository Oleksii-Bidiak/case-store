import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateOrderDetailsDto } from './update-order-details.dto';

/**
 * TASK-1973 / AD-ORD-86: the operator changes the delivery of an existing order
 * through the same PATCH — the method, the pickup point, the agreed OTHER cost.
 */
describe('UpdateOrderDetailsDto — delivery', () => {
  const errorsFor = (property: string, value: unknown) =>
    validateSync(plainToInstance(UpdateOrderDetailsDto, { [property]: value })).filter(
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
    expect(errorsFor('pickupPointId', 'nope')).not.toEqual([]);
  });

  it.each([0, 180, 99.99])('accepts an agreed shipping cost of %p', (cost) => {
    expect(errorsFor('shippingCost', cost)).toEqual([]);
  });

  it.each([-5, 10.001, 100001, '180', null])('refuses shipping cost %p', (cost) => {
    expect(errorsFor('shippingCost', cost)).not.toEqual([]);
  });

  it('leaves every delivery field optional', () => {
    expect(validateSync(plainToInstance(UpdateOrderDetailsDto, {}))).toEqual([]);
  });
});
