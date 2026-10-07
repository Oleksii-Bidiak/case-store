import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHomeBlockDto } from './create-home-block.dto';
import { UpdateHomeBlockDto } from './update-home-block.dto';

// Mirrors the global ValidationPipe behaviour from `main.ts`.
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '550e8400-e29b-41d4-a716-446655440001';

const errorsOf = async (body: Record<string, unknown>) =>
  (
    await validate(plainToInstance(CreateHomeBlockDto, body, { enableImplicitConversion: true }))
  ).map((error) => error.property);

describe('CreateHomeBlockDto — fields per type (TASK-661)', () => {
  it('accepts a CAROUSEL block with a carouselId', async () => {
    expect(await errorsOf({ type: 'CAROUSEL', carouselId: UUID })).toEqual([]);
  });

  it('requires carouselId for CAROUSEL', async () => {
    expect(await errorsOf({ type: 'CAROUSEL' })).toContain('carouselId');
  });

  it('rejects title and tabs on a CAROUSEL block', async () => {
    const errors = await errorsOf({ type: 'CAROUSEL', carouselId: UUID, title: 'X', tabs: [UUID] });
    expect(errors).toEqual(expect.arrayContaining(['title', 'tabs']));
  });

  it('accepts a TABS block with a title and tabs', async () => {
    expect(await errorsOf({ type: 'TABS', title: 'Аксесуари', tabs: [UUID, UUID2] })).toEqual([]);
  });

  it('requires title and at least one tab for TABS', async () => {
    expect(await errorsOf({ type: 'TABS' })).toEqual(expect.arrayContaining(['title', 'tabs']));
    expect(await errorsOf({ type: 'TABS', title: 'X', tabs: [] })).toContain('tabs');
    expect(await errorsOf({ type: 'TABS', title: '   ', tabs: [UUID] })).toContain('title');
  });

  it('rejects carouselId on a TABS block and a repeated tab', async () => {
    expect(await errorsOf({ type: 'TABS', title: 'X', tabs: [UUID], carouselId: UUID })).toContain(
      'carouselId',
    );
    expect(await errorsOf({ type: 'TABS', title: 'X', tabs: [UUID, UUID] })).toContain('tabs');
  });

  it('refuses to create a singleton type', async () => {
    expect(await errorsOf({ type: 'HERO' })).toContain('type');
  });

  it('accepts an optional non-negative position', async () => {
    expect(await errorsOf({ type: 'CAROUSEL', carouselId: UUID, position: 0 })).toEqual([]);
    expect(await errorsOf({ type: 'CAROUSEL', carouselId: UUID, position: -1 })).toContain(
      'position',
    );
  });
});

describe('UpdateHomeBlockDto', () => {
  it('accepts an empty body and partial fields', async () => {
    const toDto = (body: Record<string, unknown>) =>
      plainToInstance(UpdateHomeBlockDto, body, { enableImplicitConversion: true });
    expect(await validate(toDto({}))).toHaveLength(0);
    expect(await validate(toDto({ status: 'DRAFT' }))).toHaveLength(0);
    expect(await validate(toDto({ tabs: [] }))).not.toHaveLength(0);
  });
});
