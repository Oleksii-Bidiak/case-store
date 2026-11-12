import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSiteContactDto } from './update-site-contact.dto';

/**
 * TASK-1984 (forms convention, Rule 5a): the shop's support phone is checked by
 * `@IsInternationalPhone` — letters are refused (`222фіфів` used to be stored),
 * a `0 800` line passes and is kept exactly as typed (no normalisation).
 */
const build = (plain: Record<string, unknown>) =>
  plainToInstance(UpdateSiteContactDto, plain, { enableImplicitConversion: true });

const constraintsOf = async (plain: Record<string, unknown>, property: string) =>
  (await validate(build(plain)))
    .filter((error) => error.property === property)
    .flatMap((error) => Object.keys(error.constraints ?? {}));

describe('UpdateSiteContactDto', () => {
  it.each(['222фіфів', '050 111 2233 ccc', '12345'])('refuses the phone %p', async (phone) => {
    expect(await constraintsOf({ phone }, 'phone')).toContain('isInternationalPhone');
  });

  it.each(['0 800 123 456', '+380 44 000 0000', '+48 123 456 789'])(
    'accepts the phone %p and keeps it as typed',
    async (phone) => {
      const dto = build({ phone });
      expect(dto.phone).toBe(phone);
      expect(await constraintsOf({ phone }, 'phone')).toEqual([]);
    },
  );

  it('caps the email at 254 characters', async () => {
    const email = `${'a'.repeat(60)}@${'b'.repeat(50)}.${'c'.repeat(50)}.${'d'.repeat(50)}.${'e'.repeat(37)}.com`;
    expect(email).toHaveLength(255);
    expect(await constraintsOf({ email }, 'email')).toContain('maxLength');
  });
});
