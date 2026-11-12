import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubscribeDto } from './subscribe.dto';

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

/**
 * TASK-1984 (forms convention, Rule 5c): the subscribe email had no length cap
 * at all; it now has the 254 of every other email DTO and of the storefront's
 * `emailField`.
 */
describe('SubscribeDto email', () => {
  it('accepts a 254-character address', async () => {
    const email = addressOf(254);
    expect(email).toHaveLength(254);

    const errors = await validate(plainToInstance(SubscribeDto, { email }));
    expect(errors.filter((e) => e.property === 'email')).toHaveLength(0);
  });

  it('refuses a 255-character address with maxLength', async () => {
    const email = addressOf(255);
    expect(email).toHaveLength(255);

    const errors = await validate(plainToInstance(SubscribeDto, { email }));
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints).toHaveProperty('maxLength');
  });

  it('still refuses a malformed address with isEmail', async () => {
    const errors = await validate(plainToInstance(SubscribeDto, { email: 'not-an-email' }));
    const emailError = errors.find((e) => e.property === 'email');
    expect(emailError?.constraints).toHaveProperty('isEmail');
  });
});
