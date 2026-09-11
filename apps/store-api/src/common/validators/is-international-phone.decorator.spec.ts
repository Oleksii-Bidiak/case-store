import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddressDto } from '../../order/dto/address.dto';
import { GuestContactDto } from '../../order/dto/guest-contact.dto';
import { phoneDigits } from './is-international-phone.decorator';

/**
 * `@IsInternationalPhone()` on the order DTOs (TASK-407).
 *
 * Both fields stayed country-agnostic on purpose (TASK-338, restated by the
 * owner 2026-09-10) — what changed is that the rule now counts DIGITS instead of
 * mask characters. Before: `guest-contact.dto` matched `/^\+?[\d\s()-]{9,}$/`,
 * so nine brackets and no number at all was a valid courier phone, and
 * `address.dto` — the field the storefront checkout actually posts — had no
 * format rule whatsoever, so `33333` went through.
 */

/** Numbers that must keep working: a Ukrainian shop still sells across borders. */
const ACCEPTED: [string, string][] = [
  ['+380501234567', 'Ukrainian, international form'],
  ['+380 50 123 45 67', 'the mask the storefront checkout renders'],
  ['0501234567', 'Ukrainian, domestic leading zero'],
  ['+48 123 456 789', 'Polish — a border-region number'],
  ['+1 (212) 555-0123', 'US, with brackets and a dash'],
  ['+44 20 7946 0958', 'UK'],
  ['501234567', 'nine bare digits — the shortest we accept'],
  ['+123456789012345', 'fifteen digits — the E.164 ceiling'],
];

const REJECTED: [string, string][] = [
  ['(((((((((', 'nine mask characters and not one digit — what the old rule allowed'],
  ['33333', 'five digits — what address.dto had no rule against at all'],
  ['', 'empty'],
  ['   ', 'whitespace only'],
  ['+1234567890123456', 'sixteen digits — past the E.164 ceiling'],
  ['+380 50 123', 'a half-typed number'],
  ['-- () -- () --', 'separators only'],
  ['+380 50 123 45 67 call after 6pm', 'a number with a note attached'],
  ['ноль-вісім-нуль', 'words instead of digits'],
];

/**
 * `plainToInstance` runs the DTO's `@Transform`s, exactly as the global
 * ValidationPipe does with `transform: true` — so the instance these return
 * carries the value that would actually be STORED, not the one that was posted.
 */
function guestDto(phone: unknown): GuestContactDto {
  return plainToInstance(GuestContactDto, {
    email: 'olena@example.com',
    name: 'Олена Шевченко',
    phone,
  });
}

function addressDto(phone: unknown): AddressDto {
  return plainToInstance(AddressDto, {
    firstName: 'Olena',
    lastName: 'Shevchenko',
    address1: 'Нова Пошта, відділення №12',
    city: 'Kyiv',
    phone,
  });
}

function guestErrors(phone: unknown) {
  return validate(guestDto(phone)).then((errors) =>
    errors.filter((error) => error.property === 'phone'),
  );
}

function addressErrors(phone: unknown) {
  return validate(addressDto(phone)).then((errors) =>
    errors.filter((error) => error.property === 'phone'),
  );
}

describe('phoneDigits', () => {
  it.each([
    ['+380 50 123 45 67', '380501234567'],
    ['+1 (212) 555-0123', '12125550123'],
    ['(((((((((', ''],
  ])('reduces %s to the digits %s', (input, expected) => {
    expect(phoneDigits(input)).toBe(expected);
  });
});

describe('GuestContactDto phone', () => {
  it.each(ACCEPTED)('accepts %s (%s)', async (phone) => {
    expect(await guestErrors(phone)).toHaveLength(0);
  });

  it.each(REJECTED)('rejects %s (%s)', async (phone) => {
    expect((await guestErrors(phone)).length).toBeGreaterThan(0);
  });

  it('rejects a non-string phone', async () => {
    expect((await guestErrors(380501234567)).length).toBeGreaterThan(0);
  });

  it('keeps the caller-facing message the endpoint already returned', async () => {
    const [error] = await guestErrors('(((((((((');
    expect(Object.values(error.constraints ?? {})).toContain('A valid phone number is required');
  });
});

describe('AddressDto phone', () => {
  it.each(ACCEPTED)('accepts %s (%s)', async (phone) => {
    expect(await addressErrors(phone)).toHaveLength(0);
  });

  it.each(REJECTED)('rejects %s (%s)', async (phone) => {
    expect((await addressErrors(phone)).length).toBeGreaterThan(0);
  });

  it('rejects a non-string phone', async () => {
    expect((await addressErrors(380501234567)).length).toBeGreaterThan(0);
  });

  it('explains what a valid number looks like rather than just failing', async () => {
    const [error] = await addressErrors('33333');
    expect(Object.values(error.constraints ?? {}).join('; ')).toContain('9 to 15 digits');
  });
});

/**
 * The point of the change is a narrow one, so state it as its own assertion: a
 * non-Ukrainian number is still a valid order phone. If a future task decides
 * otherwise, this test is the one that has to be deleted deliberately.
 */
describe('stays country-agnostic', () => {
  it.each([['+48 123 456 789'], ['+1 (212) 555-0123'], ['+44 20 7946 0958']])(
    '%s is accepted by both order DTOs',
    async (phone) => {
      expect(await guestErrors(phone)).toHaveLength(0);
      expect(await addressErrors(phone)).toHaveLength(0);
    },
  );
});

/**
 * One number, one stored string (TASK-466).
 *
 * The storefront checkout posts the value its mask renders — `+380 50 123 45 67`
 * — while an operator entering the same order by phone types `0501234567`. Both
 * used to be stored verbatim, so the admin order search (`contains` on
 * `guestPhone` / `user.phone`) matched at most one spelling of a number that
 * exists once. Validation is unchanged: what changed is which string reaches the
 * repository.
 *
 * Note that these assert the value on the INSTANCE, not the validation outcome —
 * the first tests in this repo to do so.
 */
describe('normalises before storage', () => {
  const CONVERGE: [string, string][] = [
    ['+380 50 123 45 67', 'the mask the storefront checkout renders'],
    ['0501234567', 'Ukrainian, domestic leading zero'],
    ['+380501234567', 'international form'],
    ['380501234567', 'already canonical'],
    ['80501234567', 'the old inter-city prefix'],
    ['+38 (050) 123-45-67', 'brackets and dashes'],
    ['  +380 50 123 45 67  ', 'surrounding whitespace'],
  ];

  it.each(CONVERGE)('GuestContactDto: %s (%s) → 380501234567', (phone) => {
    expect(guestDto(phone).phone).toBe('380501234567');
  });

  it.each(CONVERGE)('AddressDto: %s (%s) → 380501234567', (phone) => {
    expect(addressDto(phone).phone).toBe('380501234567');
  });

  it('makes the masked checkout value and the operator-typed one one string', () => {
    // The pair from ACCEPTED that the whole task exists for.
    expect(guestDto('+380 50 123 45 67').phone).toBe(guestDto('0501234567').phone);
    expect(addressDto('+380 50 123 45 67').phone).toBe(addressDto('0501234567').phone);
  });

  it.each([
    ['+48 123 456 789', '48123456789', 'Polish — kept whole, never given a UA prefix'],
    ['+1 (212) 555-0123', '12125550123', 'US'],
    ['+44 20 7946 0958', '442079460958', 'UK'],
  ])('leaves a foreign number as its own digits: %s → %s (%s)', (phone, expected) => {
    expect(guestDto(phone).phone).toBe(expected);
    expect(addressDto(phone).phone).toBe(expected);
  });

  it('leaves a non-string value alone so @IsString still reports it', () => {
    expect(guestDto(380501234567).phone).toBe(380501234567 as unknown as string);
    expect(addressDto(380501234567).phone).toBe(380501234567 as unknown as string);
  });

  /**
   * The guard that keeps this a normalisation change and not a validation one:
   * class-transformer runs BEFORE class-validator, so normalising a value that
   * is not a number-and-nothing-else would hand the validator digits it never
   * saw and rescue an input the endpoint refuses today — silently deleting the
   * operator's note in the process.
   */
  it('does not rescue a value the validators refuse', async () => {
    const withNote = '+380 50 123 45 67 call after 6pm';

    expect(guestDto(withNote).phone).toBe(withNote);
    expect(addressDto(withNote).phone).toBe(withNote);
    expect((await guestErrors(withNote)).length).toBeGreaterThan(0);
    expect((await addressErrors(withNote)).length).toBeGreaterThan(0);
  });
});
