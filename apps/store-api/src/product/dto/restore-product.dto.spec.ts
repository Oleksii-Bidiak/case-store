import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RestoreProductDto } from './restore-product.dto';

/**
 * TASK-656. The restore body picks `slug`/`sku` from CreateProductDto — these pin
 * that the validators actually came along (a `PickType` that copied only the
 * Swagger metadata would accept anything) and that the body may be empty.
 */
const errorsFor = (payload: Record<string, unknown>) =>
  validate(plainToInstance(RestoreProductDto, payload, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('RestoreProductDto (TASK-656)', () => {
  it('accepts an empty body — restore on the native slug and sku', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts a well-formed slug and sku override', async () => {
    expect(await errorsFor({ slug: 'clear-case-2', sku: 'IP15-CLR-2' })).toHaveLength(0);
  });

  it.each(['Clear-Case', 'clear_case', '-clear', 'clear--case', 'deleted:abc:clear'])(
    'rejects the slug %p with the create-product pattern',
    async (slug) => {
      const errors = await errorsFor({ slug });
      expect(errors.map((e) => e.property)).toEqual(['slug']);
    },
  );

  it('rejects a slug over 255 and a sku over 50 characters', async () => {
    const errors = await errorsFor({ slug: 'a'.repeat(256), sku: 'S'.repeat(51) });
    expect(errors.map((e) => e.property).sort()).toEqual(['sku', 'slug']);
  });

  it('rejects any field other than slug and sku', async () => {
    const errors = await errorsFor({ isActive: true });
    expect(errors.map((e) => e.property)).toEqual(['isActive']);
  });
});
