import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectLookupQueryDto } from './slug-redirect-lookup-query.dto';

// Validation spec for the public slug-redirect lookup query (TASK-285-D +
// review follow-up). The endpoint is public and unauthenticated, so the slug
// param must be bounded (@MaxLength(255), repo convention for slug fields) —
// otherwise an attacker can push arbitrarily long strings into the indexed
// lookup query.

const toDto = (query: Record<string, unknown>): SlugRedirectLookupQueryDto =>
  plainToInstance(SlugRedirectLookupQueryDto, query, {
    enableImplicitConversion: true,
  });

describe('SlugRedirectLookupQueryDto', () => {
  it('accepts a valid entity + slug pair', async () => {
    const errors = await validate(toDto({ entity: SlugRedirectEntity.PAGE, slug: 'stara-adresa' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts a slug of exactly 255 characters', async () => {
    const errors = await validate(
      toDto({ entity: SlugRedirectEntity.PRODUCT, slug: 'a'.repeat(255) }),
    );
    expect(errors.filter((e) => e.property === 'slug')).toHaveLength(0);
  });

  it('rejects a slug longer than 255 characters', async () => {
    const errors = await validate(
      toDto({ entity: SlugRedirectEntity.PRODUCT, slug: 'a'.repeat(256) }),
    );
    const slugErrors = errors.filter((e) => e.property === 'slug');
    expect(slugErrors).toHaveLength(1);
    expect(slugErrors[0].constraints).toHaveProperty('maxLength');
  });

  it('rejects an empty slug', async () => {
    const errors = await validate(toDto({ entity: SlugRedirectEntity.CATEGORY, slug: '' }));
    expect(errors.filter((e) => e.property === 'slug').length).toBeGreaterThan(0);
  });

  it('rejects an unknown entity value', async () => {
    const errors = await validate(toDto({ entity: 'BANANA', slug: 'ok' }));
    expect(errors.filter((e) => e.property === 'entity').length).toBeGreaterThan(0);
  });
});
