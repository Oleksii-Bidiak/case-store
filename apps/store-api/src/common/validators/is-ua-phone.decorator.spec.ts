import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactMessageDto } from '../../contact/dto/create-contact-message.dto';
import { normalizeUaPhone } from './is-ua-phone.decorator';

/**
 * `@IsUaPhone()` on the contact form (TASK-407).
 *
 * The field had no format rule at all — `@MinLength(5)` — so `12345` was a
 * perfectly valid way to ask us to call back. The value arrives having been
 * through a display mask, so the rule has to judge the number rather than the
 * punctuation around it.
 */

async function phoneErrors(phone: unknown) {
  const dto = plainToInstance(CreateContactMessageDto, {
    name: 'Ivan Petrenko',
    phone,
    email: 'ivan@example.com',
    message: 'Доброго дня! Хотів би дізнатись про наявність.',
  });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'phone');
}

describe('normalizeUaPhone', () => {
  it.each([
    ['+380671234567', '380671234567'],
    ['+380 67 123 4567', '380671234567'],
    ['0671234567', '380671234567'],
    ['80671234567', '380671234567'],
    ['671234567', '380671234567'],
    ['+38 (067) 123-45-67', '380671234567'],
  ])('reduces %s to %s', (input, expected) => {
    expect(normalizeUaPhone(input)).toBe(expected);
  });

  it('never truncates — a foreign number keeps every digit it came with', () => {
    expect(normalizeUaPhone('+1 234 567 8901')).toBe('12345678901');
  });
});

describe('CreateContactMessageDto phone', () => {
  it.each([
    ['+380671234567', 'full international form'],
    ['+380 67 123 4567', 'the mask the storefront input renders'],
    ['0671234567', 'domestic leading zero'],
    ['+38 (067) 123-45-67', 'brackets and dashes'],
  ])('accepts %s (%s)', async (phone) => {
    expect(await phoneErrors(phone)).toHaveLength(0);
  });

  it.each([
    ['12345', 'the five characters the old @MinLength(5) waved through'],
    ['', 'empty'],
    ['+380 67 123', 'a half-typed number'],
    ['+1 234 567 8901', 'a foreign number'],
    ['((((((((((', 'punctuation only'],
  ])('rejects %s (%s)', async (phone) => {
    expect((await phoneErrors(phone)).length).toBeGreaterThan(0);
  });

  it('rejects a non-string phone', async () => {
    expect((await phoneErrors(380671234567)).length).toBeGreaterThan(0);
  });

  it('explains the expected format rather than just failing', async () => {
    const [error] = await phoneErrors('12345');
    expect(Object.values(error.constraints ?? {}).join('; ')).toContain(
      '+380 followed by 9 digits',
    );
  });
});
