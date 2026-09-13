import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuditLogQueryDto } from './audit-log-query.dto';

/**
 * The `actorRole` filter at the HTTP boundary (TASK-430).
 *
 * Worth its own spec because a query param arrives as a STRING and this DTO is
 * validated under `enableImplicitConversion: true` — the setting that has already
 * bitten this project once on booleans (see the boolean-query-DTO note in
 * AGENTS-adjacent docs). An enum that silently accepted `"manager"` would reach
 * Prisma as a role no row carries and answer «Немає записів», which is
 * indistinguishable from an empty log.
 */
function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(AuditLogQueryDto, query, { enableImplicitConversion: true });
  return { dto, errors: validateSync(dto, { whitelist: true }) };
}

describe('AuditLogQueryDto — actorRole (TASK-430)', () => {
  it.each(['ADMIN', 'MANAGER', 'CUSTOMER'])('accepts %s', (actorRole) => {
    const { dto, errors } = parse({ actorRole });

    expect(errors).toEqual([]);
    expect(dto.actorRole).toBe(actorRole);
  });

  it('is optional — an unfiltered read stays unfiltered', () => {
    const { dto, errors } = parse({});

    expect(errors).toEqual([]);
    expect(dto.actorRole).toBeUndefined();
  });

  it.each(['manager', 'OWNER', 'MANAGER ', ''])('rejects %p', (actorRole) => {
    const { errors } = parse({ actorRole });

    expect(errors).not.toEqual([]);
    expect(errors[0].property).toBe('actorRole');
  });
});
