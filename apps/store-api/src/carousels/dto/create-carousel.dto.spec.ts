import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CarouselPlacement, CarouselSource } from '@prisma/client';
import { CreateCarouselDto } from './create-carousel.dto';
import { UpdateCarouselDto } from './update-carousel.dto';
import { CarouselListQueryDto } from './carousel-list-query.dto';

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

describe('Carousel DTOs — placement (TASK-288)', () => {
  it('accepts a create without a placement (the DB default HOME_RAILS applies)', async () => {
    const errors = await validate(toDto({ title: 'Хіти', source: CarouselSource.BESTSELLING }));
    expect(errors.some((e) => e.property === 'placement')).toBe(false);
  });

  it('accepts every known placement on create', async () => {
    for (const placement of Object.values(CarouselPlacement)) {
      const errors = await validate(
        toDto({ title: 'Хіти', source: CarouselSource.BESTSELLING, placement }),
      );
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects an unknown placement on create', async () => {
    const errors = await validate(
      toDto({ title: 'Хіти', source: CarouselSource.BESTSELLING, placement: 'HOME_SIDEBAR' }),
    );
    expect(errors.some((e) => e.property === 'placement')).toBe(true);
  });

  it('accepts a placement-only update (moving a carousel between homepage sections)', async () => {
    const dto = plainToInstance(
      UpdateCarouselDto,
      { placement: CarouselPlacement.HOME_TABS },
      { enableImplicitConversion: true },
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an unknown placement on update', async () => {
    const dto = plainToInstance(
      UpdateCarouselDto,
      { placement: 'HOME_SIDEBAR' },
      { enableImplicitConversion: true },
    );

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'placement')).toBe(true);
  });

  it('accepts the public list query with and without a placement, rejecting unknown values', async () => {
    const toQuery = (body: Record<string, unknown>): CarouselListQueryDto =>
      plainToInstance(CarouselListQueryDto, body, { enableImplicitConversion: true });

    expect(await validate(toQuery({}))).toHaveLength(0);
    expect(await validate(toQuery({ placement: CarouselPlacement.HOME_TABS }))).toHaveLength(0);
    expect(await validate(toQuery({ placement: 'HOME_SIDEBAR' }))).toHaveLength(1);
  });
});
