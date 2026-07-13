import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CategoryListQueryDto } from './category-list-query.dto';

/**
 * Reproduces the global ValidationPipe behaviour (`transform` +
 * `enableImplicitConversion: true`): the raw query string is Boolean-coerced
 * BEFORE any `@Transform` runs, and `Boolean('false')` is `true`. The DTO must
 * therefore derive `isActive` from the ORIGINAL string via `obj[key]` — reading
 * the already-coerced `value` made `?isActive=false` filter to ACTIVE categories,
 * i.e. the exact OPPOSITE of what the admin asked for (TASK-297).
 *
 * Same trap, same fix as ProductListQueryDto (TASK-230) and UserListQueryDto.
 */
describe('CategoryListQueryDto — isActive transform (TASK-297)', () => {
  const toDto = (query: Record<string, unknown>): CategoryListQueryDto =>
    plainToInstance(CategoryListQueryDto, query, { enableImplicitConversion: true });

  it('coerces "true" to boolean true', () => {
    expect(toDto({ isActive: 'true' }).isActive).toBe(true);
  });

  it('coerces "false" to boolean false (not the truthy-string trap)', () => {
    expect(toDto({ isActive: 'false' }).isActive).toBe(false);
  });

  it('leaves isActive undefined when the param is absent', () => {
    expect(toDto({}).isActive).toBeUndefined();
  });

  it('treats an unrecognised value as no filter (undefined)', () => {
    expect(toDto({ isActive: 'banana' }).isActive).toBeUndefined();
  });

  it('accepts real booleans as well as their string forms', () => {
    expect(toDto({ isActive: true }).isActive).toBe(true);
    expect(toDto({ isActive: false }).isActive).toBe(false);
  });

  it('passes class-validator for each of true / false / absent', async () => {
    for (const query of [{ isActive: 'true' }, { isActive: 'false' }, {}]) {
      const errors = await validate(toDto(query));
      expect(errors.filter((e) => e.property === 'isActive')).toHaveLength(0);
    }
  });
});
