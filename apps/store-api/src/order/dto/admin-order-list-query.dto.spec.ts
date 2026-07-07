import { plainToInstance } from 'class-transformer';
import { AdminOrderListQueryDto } from './admin-order-list-query.dto';

/**
 * Regression tests for the `unpaidInTransit` boolean query filter (TASK-248).
 *
 * The global ValidationPipe runs with `enableImplicitConversion: true`, which
 * coerces raw query strings to their target type BEFORE the DTO's `@Transform`
 * runs — and `Boolean('false')` is `true`. Without the explicit `obj[key]`
 * guard, `?unpaidInTransit=false` would resolve to `true` and wrongly filter to
 * in-transit orders. These tests pin the coercion, mirroring the existing
 * `ProductListQueryDto.isActive` case (TASK-150-B5 / TASK-230).
 */
describe('AdminOrderListQueryDto — unpaidInTransit boolean transform', () => {
  const toDto = (raw: Record<string, unknown>) =>
    plainToInstance(AdminOrderListQueryDto, raw, { enableImplicitConversion: true });

  it('resolves ?unpaidInTransit=true to boolean true', () => {
    expect(toDto({ unpaidInTransit: 'true' }).unpaidInTransit).toBe(true);
  });

  it('resolves ?unpaidInTransit=false to boolean false (not true)', () => {
    expect(toDto({ unpaidInTransit: 'false' }).unpaidInTransit).toBe(false);
  });

  it('leaves unpaidInTransit undefined when the param is absent', () => {
    expect(toDto({}).unpaidInTransit).toBeUndefined();
  });

  it('coerces an already-boolean value through unchanged', () => {
    expect(toDto({ unpaidInTransit: true }).unpaidInTransit).toBe(true);
    expect(toDto({ unpaidInTransit: false }).unpaidInTransit).toBe(false);
  });
});
