import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CarouselSource } from '@prisma/client';
import { CreateCarouselDto } from './create-carousel.dto';

// Mirrors the global ValidationPipe behaviour from `main.ts` (transform +
// `enableImplicitConversion: true`).

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const toDto = (body: Record<string, unknown>): CreateCarouselDto =>
  plainToInstance(CreateCarouselDto, body, { enableImplicitConversion: true });

describe('CreateCarouselDto — conditional categoryId (TASK-139)', () => {
  it('accepts a rule-based source without a categoryId', async () => {
    const errors = await validate(toDto({ title: 'Хіти', source: CarouselSource.BESTSELLING }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a MISSING categoryId when source = CATEGORY (400 at the pipe)', async () => {
    const errors = await validate(toDto({ title: 'Аксесуари', source: CarouselSource.CATEGORY }));
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('rejects a malformed categoryId when source = CATEGORY', async () => {
    const errors = await validate(
      toDto({ title: 'Аксесуари', source: CarouselSource.CATEGORY, categoryId: 'not-a-uuid' }),
    );
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('accepts CATEGORY with a valid UUID categoryId', async () => {
    const errors = await validate(
      toDto({ title: 'Аксесуари', source: CarouselSource.CATEGORY, categoryId: UUID }),
    );
    expect(errors).toHaveLength(0);
  });

  it('ignores categoryId validation for MANUAL (service nulls it out)', async () => {
    const errors = await validate(
      toDto({ title: 'Вибране', source: CarouselSource.MANUAL, categoryId: 'not-a-uuid' }),
    );
    expect(errors.some((e) => e.property === 'categoryId')).toBe(false);
  });

  it('bounds itemLimit to 1..24', async () => {
    for (const [itemLimit, valid] of [
      [0, false],
      [1, true],
      [24, true],
      [25, false],
    ] as const) {
      const errors = await validate(
        toDto({ title: 'Хіти', source: CarouselSource.BESTSELLING, itemLimit }),
      );
      expect(errors.some((e) => e.property === 'itemLimit')).toBe(!valid);
    }
  });
});
