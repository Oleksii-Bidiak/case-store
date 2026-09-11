import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';

/**
 * Password strength policy on registration (TASK-227, loosened for shoppers by
 * owner decision 2026-09-10 / TASK-407).
 *
 * QA originally found that `testtest` (8 chars, no uppercase, no digit) was
 * accepted, and the fix required an uppercase letter too. The live demo run then
 * showed shoppers abandoning registration on that requirement, so the shopper
 * rule is now: min 8 characters + at least one lowercase letter and one digit.
 * Staff accounts keep the strict rule (see `password-policy.decorator.spec.ts`).
 *
 * Login stays exempt from all of it — existing accounts predate every version.
 */

async function validatePassword(password: unknown) {
  const dto = plainToInstance(RegisterDto, {
    email: 'user@example.com',
    password,
  });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'password');
}

describe('RegisterDto password policy', () => {
  describe('rejects weak passwords', () => {
    it.each([
      ['testtest', 'the QA sample — no digit'],
      ['12345678', 'digits only, no letter'],
      ['TESTTEST1', 'no lowercase letter'],
      ['Tt1', 'shorter than 8 characters'],
    ])('%s (%s)', async (password) => {
      const errors = await validatePassword(password);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('reports an explicit policy message for testtest', async () => {
      const [error] = await validatePassword('testtest');
      expect(Object.values(error.constraints ?? {}).join('; ')).toContain(
        'at least one lowercase letter and one digit',
      );
    });

    // The message has to describe the rule that is enforced, not a laxer one:
    // `PAROLE123` has "a letter and a digit" and is refused all the same.
    it('names the lowercase requirement for an uppercase-only password', async () => {
      const [error] = await validatePassword('PAROLE123');
      expect(Object.values(error.constraints ?? {}).join('; ')).toContain('lowercase');
    });

    it('rejects a non-string password', async () => {
      const errors = await validatePassword(12345678);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('accepts policy-compliant passwords', () => {
    it.each([
      ['testtest1', 'the shopper case that used to need an uppercase letter'],
      ['Testtest1', 'an uppercase letter is allowed, just not demanded'],
      ['strongp@ss123', 'special characters allowed but not required'],
      ['пароль123', 'Unicode-aware — Cyrillic letters count'],
    ])('%s (%s)', async (password) => {
      const errors = await validatePassword(password);
      expect(errors).toHaveLength(0);
    });
  });
});

describe('LoginDto password (policy exempt)', () => {
  it('still accepts a legacy weak password — policy must never block login', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'testtest',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
