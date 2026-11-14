import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeviceBrandDto } from './create-device-brand.dto';
import { UpdateDeviceBrandDto } from './update-device-brand.dto';
import { CreateDeviceModelDto } from './create-device-model.dto';
import { UpdateDeviceModelDto } from './update-device-model.dto';

/** TASK-1984 (forms Rule 5d): device brand / model names are required on both ends. */
describe('Device DTOs — a blank name (TASK-1984)', () => {
  const deviceBrandId = '550e8400-e29b-41d4-a716-446655440000';

  it.each([CreateDeviceBrandDto, UpdateDeviceBrandDto, CreateDeviceModelDto, UpdateDeviceModelDto])(
    '%p refuses a whitespace name',
    async (dto) => {
      const errors = await validate(plainToInstance(dto, { deviceBrandId, name: '   ' }));
      const nameError = errors.find((e) => e.property === 'name');
      expect(Object.keys(nameError?.constraints ?? {})).toContain('isNotEmpty');
    },
  );

  it('accepts a real model name', async () => {
    const errors = await validate(
      plainToInstance(CreateDeviceModelDto, { deviceBrandId, name: 'iPhone 15' }),
    );
    expect(errors).toEqual([]);
  });
});
