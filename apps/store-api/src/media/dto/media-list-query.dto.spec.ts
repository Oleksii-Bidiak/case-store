import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MediaListQueryDto } from './media-list-query.dto';

/**
 * `view` and `sort` on the media list (TASK-1730).
 *
 * Both reach the repository as a choice between fixed SQL fragments, so the DTO
 * is the gate that keeps anything else from getting that far: an unknown value
 * must be a 400, never a silent fallback to "all, newest first" that an
 * operator would read as "the filter found everything".
 */
function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(MediaListQueryDto, query, { enableImplicitConversion: true });
  return { dto, errors: validateSync(dto, { whitelist: true }) };
}

describe('MediaListQueryDto — view and sort (TASK-1730)', () => {
  it.each(['all', 'unused', 'noAlt'])('accepts view=%s', (view) => {
    const { dto, errors } = parse({ view });

    expect(errors).toEqual([]);
    expect(dto.view).toBe(view);
  });

  it.each(['newest', 'oldest', 'largest'])('accepts sort=%s', (sort) => {
    const { dto, errors } = parse({ sort });

    expect(errors).toEqual([]);
    expect(dto.sort).toBe(sort);
  });

  it('leaves both optional — the service owns the defaults', () => {
    const { dto, errors } = parse({});

    expect(errors).toEqual([]);
    expect(dto.view).toBeUndefined();
    expect(dto.sort).toBeUndefined();
  });

  it.each(['used', 'UNUSED', 'noalt', '', "unused' OR 1=1"])('rejects view=%p', (view) => {
    const { errors } = parse({ view });

    expect(errors.map((error) => error.property)).toContain('view');
  });

  it.each(['smallest', 'NEWEST', 'created_at desc', ''])('rejects sort=%p', (sort) => {
    const { errors } = parse({ sort });

    expect(errors.map((error) => error.property)).toContain('sort');
  });
});
