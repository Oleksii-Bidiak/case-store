import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteCategoryDto } from './delete-category.dto';

/**
 * Field validation of `DELETE /api/admin/categories/:id`'s body (TASK-652), run the
 * way the global ValidationPipe runs it (`transform` + implicit conversion,
 * `whitelist` + `forbidNonWhitelisted`). The exactly-one-mode rule is NOT here — it
 * lives in `CategoryService.delete`, so it can answer with a stable error code.
 */
describe('DeleteCategoryDto', () => {
  const check = async (body: Record<string, unknown>) => {
    const dto = plainToInstance(DeleteCategoryDto, body, { enableImplicitConversion: true });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, errors };
  };

  it('accepts a moveToId UUID', async () => {
    const { errors } = await check({ moveToId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a moveToId that is not a UUID', async () => {
    const { errors } = await check({ moveToId: 'not-a-uuid' });
    expect(errors.map((e) => e.property)).toEqual(['moveToId']);
  });

  it('trims the new target name', async () => {
    const { dto, errors } = await check({ moveToNew: { name: '  Інше  ' } });
    expect(errors).toHaveLength(0);
    expect(dto.moveToNew?.name).toBe('Інше');
  });

  it.each([[''], ['   ']])('rejects an empty new target name (%j)', async (name) => {
    const { errors } = await check({ moveToNew: { name } });
    expect(errors.map((e) => e.property)).toEqual(['moveToNew']);
  });

  it('rejects a new target name longer than a create allows', async () => {
    const { errors } = await check({ moveToNew: { name: 'x'.repeat(256) } });
    expect(errors.map((e) => e.property)).toEqual(['moveToNew']);
  });

  it('accepts a null or absent parent, and validates a present one as a UUID', async () => {
    expect((await check({ moveToNew: { name: 'A', parentId: null } })).errors).toHaveLength(0);
    expect((await check({ moveToNew: { name: 'A' } })).errors).toHaveLength(0);
    expect((await check({ moveToNew: { name: 'A', parentId: 'nope' } })).errors).toHaveLength(1);
  });

  // TASK-1837: consent to move into a hidden target.
  it('accepts allowHiddenTarget as a real boolean, and its absence', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const withTrue = await check({ moveToId: id, allowHiddenTarget: true });
    expect(withTrue.errors).toHaveLength(0);
    expect(withTrue.dto.allowHiddenTarget).toBe(true);
    expect((await check({ moveToId: id, allowHiddenTarget: false })).errors).toHaveLength(0);
    expect((await check({ moveToId: id })).dto.allowHiddenTarget).toBeUndefined();
  });

  // Implicit conversion would turn the string "false" into `true` — consent must not
  // be manufactured out of a string.
  it.each([['false'], ['true'], [1]])(
    'rejects a non-boolean allowHiddenTarget (%j)',
    async (value) => {
      const { errors } = await check({ allowHiddenTarget: value });
      expect(errors.map((e) => e.property)).toEqual(['allowHiddenTarget']);
    },
  );

  it('forbids unknown fields inside moveToNew', async () => {
    const { errors } = await check({ moveToNew: { name: 'A', slug: 'a' } });
    expect(errors.map((e) => e.property)).toEqual(['moveToNew']);
  });
});
