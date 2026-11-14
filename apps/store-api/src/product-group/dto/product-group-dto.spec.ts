import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductGroupDto } from './create-product-group.dto';
import { UpdateProductGroupDto } from './update-product-group.dto';

/** TASK-1984 (forms Rule 5d): a group name of spaces is blank on both ends. */
describe('Product group DTOs — a blank name (TASK-1984)', () => {
  it.each([CreateProductGroupDto, UpdateProductGroupDto])(
    '%p refuses a whitespace name',
    async (dto) => {
      const errors = await validate(plainToInstance(dto, { name: '   ' }));
      const nameError = errors.find((e) => e.property === 'name');
      expect(Object.keys(nameError?.constraints ?? {})).toContain('minLength');
    },
  );
});
