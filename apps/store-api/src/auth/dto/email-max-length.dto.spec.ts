import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RequestPasswordResetDto } from './request-password-reset.dto';

/**
 * TASK-1984 (forms convention, Rule 5c): every email the API takes is capped at
 * 254 — the storefront's `emailField` has the same cap, so login and
 * forgot-password no longer accept on one end what the other refuses.
 */

/** A valid address of exactly `length` characters: 60-char local part, ≤50-char labels. */
function addressOf(length: number): string {
  const head = `${'u'.repeat(60)}@`;
  let budget = length - head.length - '.com'.length;
  const labels: string[] = [];
  while (budget > 0) {
    const dot = labels.length > 0 ? 1 : 0;
    const size = Math.min(50, budget - dot);
    labels.push('a'.repeat(size));
    budget -= size + dot;
  }
  return `${head}${labels.join('.')}.com`;
}

const cases = [
  ['LoginDto', (email: string) => plainToInstance(LoginDto, { email, password: 'x' })],
  [
    'RequestPasswordResetDto',
    (email: string) => plainToInstance(RequestPasswordResetDto, { email }),
  ],
] as const;

describe.each(cases)('%s email length', (_name, build) => {
  it('accepts a 254-character address', async () => {
    const email = addressOf(254);
    expect(email).toHaveLength(254);

    const errors = await validate(build(email));
    expect(errors.filter((e) => e.property === 'email')).toHaveLength(0);
  });

  it('refuses a 255-character address with maxLength', async () => {
    const email = addressOf(255);
    expect(email).toHaveLength(255);

    const errors = await validate(build(email));
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints).toHaveProperty('maxLength');
  });
});
