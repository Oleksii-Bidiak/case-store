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
