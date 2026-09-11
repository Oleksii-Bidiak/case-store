import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from '../../user/dto/create-user.dto';
import { SetUserPasswordDto } from '../../user/dto/set-user-password.dto';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { ConfirmPasswordResetDto } from '../../auth/dto/confirm-password-reset.dto';
import { CUSTOMER_PASSWORD_REGEX, STAFF_PASSWORD_REGEX } from './password-policy.decorator';

/**
 * The two password policies (TASK-407, owner decision 2026-09-10).
 *
 * The split is only real if each DTO is wired to the right one, so this spec
 * exercises the DTOs rather than the decorators in isolation: which endpoint got
 * which rule IS the decision.
 */

/** `testtest1` — legal for a shopper, illegal for staff. The whole split in one string. */
const SHOPPER_ONLY = 'testtest1';
const STAFF_GRADE = 'Testtest1';

async function errorsFor(dto: object, property: string) {
  const found = await validate(dto);
  return found.filter((error) => error.property === property);
}

describe('staff DTOs keep the strict policy', () => {
  it.each([
    [
      'POST /api/users',
      () =>
        plainToInstance(CreateUserDto, {
          email: 'manager@example.com',
          password: SHOPPER_ONLY,
          role: 'MANAGER',
        }),
      'password',
    ],
    [
      'POST /api/users/:id/password',
      () => plainToInstance(SetUserPasswordDto, { newPassword: SHOPPER_ONLY }),
      'newPassword',
    ],
  ])('%s rejects a password with no uppercase letter', async (_route, build, property) => {
    const errors = await errorsFor(build(), property);
    expect(errors.length).toBeGreaterThan(0);
    expect(Object.values(errors[0].constraints ?? {}).join('; ')).toContain(
      'one lowercase letter, one uppercase letter and one digit',
    );
  });

  it.each([
    [
      'POST /api/users',
      () =>
        plainToInstance(CreateUserDto, {
          email: 'manager@example.com',
          password: STAFF_GRADE,
          role: 'MANAGER',
        }),
      'password',
    ],
    [
      'POST /api/users/:id/password',
      () => plainToInstance(SetUserPasswordDto, { newPassword: STAFF_GRADE }),
      'newPassword',
    ],
  ])('%s accepts a strict password', async (_route, build, property) => {
    expect(await errorsFor(build(), property)).toHaveLength(0);
  });
});

describe('self-service DTOs take the shopper policy', () => {
  /**
   * Neither of these can see a role: the change body carries none and the reset
   * body carries an opaque token. They validate loosely on purpose, and
   * `AuthService` re-checks the strict rule for a staff account — the branch
   * covered in `auth.service.spec.ts`.
   */
  it('POST /api/auth/password/change accepts a shopper-grade new password', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'whatever-it-was',
      newPassword: SHOPPER_ONLY,
    });
    expect(await errorsFor(dto, 'newPassword')).toHaveLength(0);
  });

  it('POST /api/auth/password/reset/confirm accepts a shopper-grade new password', async () => {
    const dto = plainToInstance(ConfirmPasswordResetDto, {
      token: 'a'.repeat(64),
      newPassword: SHOPPER_ONLY,
    });
    expect(await errorsFor(dto, 'newPassword')).toHaveLength(0);
  });

  it('still rejects a password with no digit at all', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'whatever-it-was',
      newPassword: 'alllowercase',
    });
    expect((await errorsFor(dto, 'newPassword')).length).toBeGreaterThan(0);
  });

  it('never applies a strength policy to the CURRENT password', async () => {
    // An account whose password predates every policy must still be able to
    // change it — otherwise "your old password is weak" means "you are stuck".
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'weak',
      newPassword: SHOPPER_ONLY,
    });
    expect(await errorsFor(dto, 'currentPassword')).toHaveLength(0);
  });
});

describe('the two regexes', () => {
  it('are Unicode-aware, so Cyrillic passwords are not silently rejected', () => {
    expect(CUSTOMER_PASSWORD_REGEX.flags).toContain('u');
    expect(STAFF_PASSWORD_REGEX.flags).toContain('u');
    expect(CUSTOMER_PASSWORD_REGEX.test('пароль123')).toBe(true);
    expect(STAFF_PASSWORD_REGEX.test('Пароль123')).toBe(true);
  });

  it('order the two rules: staff-grade passwords always satisfy the shopper rule', () => {
    for (const password of [STAFF_GRADE, 'StrongP@ss123', 'Пароль123']) {
      expect(STAFF_PASSWORD_REGEX.test(password)).toBe(true);
      expect(CUSTOMER_PASSWORD_REGEX.test(password)).toBe(true);
    }
    expect(CUSTOMER_PASSWORD_REGEX.test(SHOPPER_ONLY)).toBe(true);
    expect(STAFF_PASSWORD_REGEX.test(SHOPPER_ONLY)).toBe(false);
  });
});
