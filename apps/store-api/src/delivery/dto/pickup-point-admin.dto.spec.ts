import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePickupPointDto, UpdatePickupPointDto } from './pickup-point-admin.dto';

/**
 * TASK-1984 (forms convention, Rule 5a): a pickup point's phone is the shop's
 * own number — `@IsInternationalPhone`, letters refused, stored as typed.
 */
const BASE = { name: 'Магазин', city: 'Київ', address: 'вул. Хрещатик, 1' };

const cases = [
  ['CreatePickupPointDto', CreatePickupPointDto],
  ['UpdatePickupPointDto', UpdatePickupPointDto],
] as const;

describe.each(cases)('%s phone', (_name, cls) => {
  const build = (phone: unknown) =>
    plainToInstance(cls, { ...BASE, phone }, { enableImplicitConversion: true });

  const phoneConstraints = async (phone: unknown) =>
    (await validate(build(phone)))
      .filter((error) => error.property === 'phone')
      .flatMap((error) => Object.keys(error.constraints ?? {}));

  it.each(['222фіфів', '044 123 45 67 ext 2', '1234'])('refuses %p', async (phone) => {
    expect(await phoneConstraints(phone)).toContain('isInternationalPhone');
  });

  it.each(['0 800 123 456', '+380 (44) 123-45-67', '+48 123 456 789'])(
    'accepts %p and keeps it as typed',
    async (phone) => {
      expect(build(phone).phone).toBe(phone);
      expect(await phoneConstraints(phone)).toEqual([]);
    },
  );

  it.each(['', '   ', null])('treats %p as "no phone"', async (phone) => {
    expect(build(phone).phone).toBeNull();
    expect(await phoneConstraints(phone)).toEqual([]);
  });
});
