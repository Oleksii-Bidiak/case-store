import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';

/**
 * Password strength policy on registration (TASK-227).
 *
 * QA found that `testtest` (8 chars, no uppercase, no digit) was accepted.
 * The policy is: min 8 characters + at least one lowercase letter, one
 * uppercase letter and one digit. No special-character requirement.
 * Login is intentionally exempt — existing accounts may predate the policy.
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
      ['testtest', 'the QA sample — no uppercase, no digit'],
      ['TESTTEST1', 'no lowercase letter'],
      ['testtest1', 'no uppercase letter'],
      ['TestTestTest', 'no digit'],
      ['12345678', 'digits only'],
      ['Tt1', 'shorter than 8 characters'],
    ])('%s (%s)', async (password) => {
      const errors = await validatePassword(password);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('reports an explicit policy message for testtest', async () => {
      const [error] = await validatePassword('testtest');
      expect(Object.values(error.constraints ?? {}).join('; ')).toContain(
        'one lowercase letter, one uppercase letter and one digit',
      );
    });

    it('rejects a non-string password', async () => {
      const errors = await validatePassword(12345678);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('accepts policy-compliant passwords', () => {
    it.each([
      ['Testtest1', 'exactly 8 chars with lower + upper + digit'],
      ['StrongP@ss123', 'special characters allowed but not required'],
      ['Пароль123', 'Unicode-aware — Cyrillic letters count'],
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
