import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

/** TASK-1984 (forms Rule 5d): the product name is required on both ends. */
describe('Product DTOs — a blank name (TASK-1984)', () => {
  const base = { price: 100, categoryId: '550e8400-e29b-41d4-a716-446655440000' };

  it.each([
    [CreateProductDto, ''],
    [CreateProductDto, '   '],
    [UpdateProductDto, ''],
    [UpdateProductDto, '   '],
  ])('%p refuses %j', async (dto, name) => {
    const errors = await validate(plainToInstance(dto, { ...base, name }));
    const nameError = errors.find((e) => e.property === 'name');
    expect(Object.keys(nameError?.constraints ?? {})).toContain('isNotEmpty');
  });

  it('accepts and trims a real name', async () => {
    const dto = plainToInstance(CreateProductDto, { ...base, name: '  Case ' });
    expect(dto.name).toBe('Case');
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'name')).toBeUndefined();
  });

  it('an update without a name stays valid', async () => {
    const errors = await validate(plainToInstance(UpdateProductDto, { price: 10 }));
    expect(errors.find((e) => e.property === 'name')).toBeUndefined();
  });
});
