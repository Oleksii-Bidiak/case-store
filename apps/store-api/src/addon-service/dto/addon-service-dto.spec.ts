import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddonServiceDto } from './create-addon-service.dto';
import { UpdateAddonServiceDto } from './update-addon-service.dto';

/** TASK-1984 (forms Rule 5d): an add-on service name is required on both ends. */
describe('Add-on service DTOs — a blank name (TASK-1984)', () => {
  it.each([CreateAddonServiceDto, UpdateAddonServiceDto])(
    '%p refuses a whitespace name',
    async (dto) => {
      const errors = await validate(plainToInstance(dto, { name: '  ', price: 0 }));
      const nameError = errors.find((e) => e.property === 'name');
      expect(Object.keys(nameError?.constraints ?? {})).toContain('isNotEmpty');
    },
  );

  it('accepts a free (0) service with a name', async () => {
    const errors = await validate(
      plainToInstance(CreateAddonServiceDto, { name: 'Скло', price: 0 }),
    );
    expect(errors).toEqual([]);
  });
});
