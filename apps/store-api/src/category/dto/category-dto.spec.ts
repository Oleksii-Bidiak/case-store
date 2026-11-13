import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';
import { UpdateCategoryDto } from './update-category.dto';

/**
 * TASK-1984 (forms Rule 5): the category DTOs refuse what the admin form refuses —
 * a blank name and an image link that is not an absolute http(s) URL.
 */
async function failed(
  dto: typeof CreateCategoryDto | typeof UpdateCategoryDto,
  payload: Record<string, unknown>,
): Promise<Record<string, string[]>> {
  const errors = await validate(plainToInstance(dto, payload));
  return Object.fromEntries(errors.map((e) => [e.property, Object.keys(e.constraints ?? {})]));
}

describe('Category DTOs — TASK-1984', () => {
  it.each([CreateCategoryDto, UpdateCategoryDto])('%p refuses a blank name', async (dto) => {
    expect((await failed(dto, { name: '' })).name).toContain('isNotEmpty');
    expect((await failed(dto, { name: '  ' })).name).toContain('isNotEmpty');
  });

  it.each([CreateCategoryDto, UpdateCategoryDto])(
    '%p takes an absolute http(s) image, localhost included',
    async (dto) => {
      for (const image of [
        'https://cdn.example.com/a.jpg',
        'http://localhost:3001/uploads/a.jpg',
      ]) {
        expect(await failed(dto, { name: 'Cases', image })).toEqual({});
      }
    },
  );

  it.each([CreateCategoryDto, UpdateCategoryDto])(
    '%p refuses a bare host or another scheme',
    async (dto) => {
      for (const image of ['cdn.example.com/a.jpg', 'ftp://example.com/a.jpg']) {
        expect((await failed(dto, { name: 'Cases', image })).image).toContain('isUrl');
      }
    },
  );
});
