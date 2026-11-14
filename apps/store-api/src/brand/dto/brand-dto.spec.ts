import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBrandDto } from './create-brand.dto';
import { UpdateBrandDto } from './update-brand.dto';

/**
 * TASK-1984 (forms Rule 5): the brand DTOs refuse what the admin form refuses —
 * a blank name and a logo link that is not an absolute http(s) URL.
 */
async function failed(
  dto: typeof CreateBrandDto | typeof UpdateBrandDto,
  payload: Record<string, unknown>,
): Promise<Record<string, string[]>> {
  const errors = await validate(plainToInstance(dto, payload));
  return Object.fromEntries(errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]));
}

describe('Brand DTOs — TASK-1984', () => {
  it.each([CreateBrandDto, UpdateBrandDto])(
    '%p refuses a blank or whitespace name',
    async (dto) => {
      expect((await failed(dto, { name: '' })).name).toContain('isNotEmpty');
      expect((await failed(dto, { name: '   ' })).name).toContain('isNotEmpty');
    },
  );

  it('trims the name it accepts', () => {
    expect(plainToInstance(CreateBrandDto, { name: '  Spigen ' }).name).toBe('Spigen');
  });

  it.each([CreateBrandDto, UpdateBrandDto])(
    '%p takes an absolute http(s) logo, localhost included',
    async (dto) => {
      for (const logo of [
        'https://cdn.example.com/spigen.svg',
        'http://localhost:3001/uploads/brands/a.png',
      ]) {
        expect(await failed(dto, { name: 'Spigen', logo })).toEqual({});
      }
    },
  );

  it.each([CreateBrandDto, UpdateBrandDto])(
    '%p refuses a bare host, another scheme or a script',
    async (dto) => {
      for (const logo of [
        'cdn.example.com/spigen.svg',
        'ftp://example.com/a.png',
        'javascript:alert(1)',
      ]) {
        expect((await failed(dto, { name: 'Spigen', logo })).logo).toContain('isUrl');
      }
    },
  );
});
