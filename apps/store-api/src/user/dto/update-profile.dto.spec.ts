import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

/**
 * TASK-799: the profile phone answers to the same rule as the delivery phone
 * (`@IsInternationalPhone`), and removal has to be said explicitly.
 *
 * Mirrors the global ValidationPipe: transform first (with implicit
 * conversion), then validate.
 */
async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, body, { enableImplicitConversion: true });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, phoneErrors: errors.filter((e) => e.property === 'phone') };
}

describe('UpdateProfileDto.phone (TASK-799)', () => {
  it('refuses "----------" instead of storing an empty number', async () => {
    const { phoneErrors } = await check({ phone: '----------' });

    expect(phoneErrors).toHaveLength(1);
    expect(phoneErrors[0].constraints).toHaveProperty('isInternationalPhone');
  });

  it.each(['33333', '(((((((((', 'call me', '+380 50 123 45 67 after 6pm', '1234567890123456'])(
    'refuses %p',
    async (phone) => {
      const { phoneErrors } = await check({ phone });
      expect(phoneErrors.length).toBeGreaterThan(0);
    },
  );

  it.each([
    ['+380 50 111 2233', '380501112233'],
    ['050 111 2233', '380501112233'],
    ['0501112233', '380501112233'],
    ['+48 123 456 789', '48123456789'],
  ])('accepts %p and stores it normalised as %p', async (phone, stored) => {
    const { dto, phoneErrors } = await check({ phone });

    expect(phoneErrors).toHaveLength(0);
    expect(dto.phone).toBe(stored);
  });

  it('treats an explicit null as "remove my number"', async () => {
    const { dto, phoneErrors } = await check({ phone: null });

    expect(phoneErrors).toHaveLength(0);
    expect(dto.phone).toBeNull();
  });

  it.each(['', '   '])('treats a blank string %p as an explicit removal (null)', async (phone) => {
    const { dto, phoneErrors } = await check({ phone });

    expect(phoneErrors).toHaveLength(0);
    expect(dto.phone).toBeNull();
  });

  it('leaves the phone untouched when the field is omitted', async () => {
    const { dto, phoneErrors } = await check({ firstName: 'Ivan' });

    expect(phoneErrors).toHaveLength(0);
    expect(dto.phone).toBeUndefined();
  });
});
