import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

/**
 * TASK-799: removal has to be said explicitly, and a garbled phone is refused.
 * TASK-1984 (D1): the rule is `@IsUaPhone` — the storefront profile is the
 * shopper's own number and the storefront only accepts a UA one, so the client
 * and the server answer to the same rule (forms convention, Rule 5a).
 *
 * Mirrors the global ValidationPipe: transform first (with implicit
 * conversion), then validate.
 */
async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, body, { enableImplicitConversion: true });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, phoneErrors: errors.filter((e) => e.property === 'phone') };
}

describe('UpdateProfileDto.phone', () => {
  it('refuses "----------" instead of storing an empty number (TASK-799)', async () => {
    const { phoneErrors } = await check({ phone: '----------' });

    expect(phoneErrors).toHaveLength(1);
    expect(phoneErrors[0].constraints).toHaveProperty('isUaPhone');
  });

  it.each([
    '33333',
    '(((((((((',
    'call me',
    '+380 50 123 45 67 after 6pm',
    '050 111 2233 ccc',
    '1234567890123456',
  ])('refuses %p', async (phone) => {
    const { phoneErrors } = await check({ phone });
    expect(phoneErrors.length).toBeGreaterThan(0);
  });

  it.each(['+48 123 456 789', '+1 234 567 8901'])(
    'refuses the foreign number %p with isUaPhone (TASK-1984, D1)',
    async (phone) => {
      const { phoneErrors } = await check({ phone });

      expect(phoneErrors).toHaveLength(1);
      expect(phoneErrors[0].constraints).toHaveProperty('isUaPhone');
      expect(phoneErrors[0].constraints).not.toHaveProperty('isInternationalPhone');
    },
  );

  it.each([
    ['+380 50 111 2233', '380501112233'],
    ['050 111 2233', '380501112233'],
    ['0501112233', '380501112233'],
    ['+38 (050) 111-22-33', '380501112233'],
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
