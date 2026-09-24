import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../auth/dto/login.dto';
import { RegisterDto } from '../../auth/dto/register.dto';
import { RequestPasswordResetDto } from '../../auth/dto/request-password-reset.dto';
import { CreateContactMessageDto } from '../../contact/dto/create-contact-message.dto';
import { SubscribeDto } from '../../newsletter/dto/subscribe.dto';
import { UnsubscribeDto } from '../../newsletter/dto/unsubscribe.dto';
import { ManualOrderContactDto } from '../../order/dto/create-manual-order.dto';
import { GuestContactDto } from '../../order/dto/guest-contact.dto';
import { UpdateSiteContactDto } from '../../site-contact/dto/update-site-contact.dto';
import { CreateStaffDto } from '../../staff/dto/create-staff.dto';
import { UpdateProfileDto } from '../../user/dto/update-profile.dto';

/**
 * Every DTO that carries an email normalises it at the boundary (TASK-772).
 *
 * The defect this sweep guards against is not "one DTO forgot" but "the NEXT one
 * forgets": four of these already lowercased and seven did not, which is how
 * `A@Gmail.com` registered next to a Google sign-in for `a@gmail.com` became
 * two accounts. A DTO that gains an email field belongs in this table.
 *
 * Transformed the way the global ValidationPipe does it (`transform: true` +
 * `enableImplicitConversion: true`), so the implicit String conversion is part
 * of what is exercised.
 */
type EmailDto = new () => { email?: string };

const cases: Array<[string, EmailDto]> = [
  ['RegisterDto', RegisterDto],
  ['LoginDto', LoginDto],
  ['RequestPasswordResetDto', RequestPasswordResetDto],
  ['UpdateProfileDto', UpdateProfileDto],
  ['CreateStaffDto', CreateStaffDto],
  ['GuestContactDto', GuestContactDto],
  ['ManualOrderContactDto', ManualOrderContactDto],
  ['CreateContactMessageDto', CreateContactMessageDto],
  ['SubscribeDto', SubscribeDto],
  ['UnsubscribeDto', UnsubscribeDto],
  ['UpdateSiteContactDto', UpdateSiteContactDto],
];

const toDto = <T extends object>(cls: new () => T, plain: Record<string, unknown>): T =>
  plainToInstance(cls, plain, { enableImplicitConversion: true });

describe('email normalisation across DTOs (TASK-772)', () => {
  describe.each(cases)('%s', (_name, cls) => {
    it('trims and lowercases the email before validation', async () => {
      const dto = toDto(cls, { email: '  A.User@Gmail.COM ' });

      expect(dto.email).toBe('a.user@gmail.com');
      const errors = await validate(dto);
      expect(errors.filter((error) => error.property === 'email')).toHaveLength(0);
    });

    it('still refuses a malformed address', async () => {
      const dto = toDto(cls, { email: '  Not-An-Email ' });

      const errors = await validate(dto);
      expect(errors.filter((error) => error.property === 'email').length).toBeGreaterThan(0);
    });
  });

  it('ManualOrderContactDto still maps a blank email to "not given"', async () => {
    const dto = toDto(ManualOrderContactDto, { email: '   ' });

    expect(dto.email).toBeUndefined();
    const errors = await validate(dto);
    expect(errors.filter((error) => error.property === 'email')).toHaveLength(0);
  });
});

describe('RegisterDto.email length bound (TASK-772)', () => {
  it('declares an explicit 254-character @MaxLength like the other auth text fields', async () => {
    const local = 'a'.repeat(64);
    const label = 'b'.repeat(63);
    const email = `${local}@${label}.${label}.${label}.com`; // 260 chars

    const dto = toDto(RegisterDto, { email, password: 'testtest1' });
    const [error] = (await validate(dto)).filter((e) => e.property === 'email');

    expect(error?.constraints).toHaveProperty('maxLength');
  });
});
