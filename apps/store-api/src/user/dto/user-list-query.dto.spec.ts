import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserListQueryDto } from './user-list-query.dto';

// These tests reproduce the global ValidationPipe behaviour configured in
// `main.ts` (transform + `enableImplicitConversion: true`). Under implicit
// conversion, class-transformer coerces the raw query string to the property's
// reflected type (`Boolean`) BEFORE any `@Transform` runs — and `Boolean('false')`
// is `true`. The DTO must therefore derive `isActive` from the ORIGINAL string,
// otherwise the admin "All statuses" filter silently never filters (TASK-150 B5).

const toDto = (query: Record<string, unknown>): UserListQueryDto =>
  plainToInstance(UserListQueryDto, query, { enableImplicitConversion: true });

describe('UserListQueryDto — isActive transform (TASK-150 B5)', () => {
  it('coerces "true" to boolean true', () => {
    expect(toDto({ isActive: 'true' }).isActive).toBe(true);
  });

  it('coerces "false" to boolean false (not the truthy-string trap)', () => {
    expect(toDto({ isActive: 'false' }).isActive).toBe(false);
  });

  it('leaves isActive undefined when the param is absent (all statuses)', () => {
    expect(toDto({}).isActive).toBeUndefined();
  });

  it('treats an unrecognised value as no filter (undefined)', () => {
    expect(toDto({ isActive: 'banana' }).isActive).toBeUndefined();
  });

  it('passes class-validator for each of true / false / absent', async () => {
    for (const query of [{ isActive: 'true' }, { isActive: 'false' }, {}]) {
      const errors = await validate(toDto(query));
      expect(errors.filter((e) => e.property === 'isActive')).toHaveLength(0);
    }
  });
});
