import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStaffDto } from './create-staff.dto';

/**
 * TASK-1984 (forms convention, Rule 5c): the staff login is capped at 254 like
 * every other email the API takes — the admin wizard's `emailField` has the
 * same cap, so neither end accepts what the other refuses.
 */
const build = (email: string) =>
  plainToInstance(CreateStaffDto, { email, password: 'StrongPass1', role: 'MANAGER' });

/** A valid address of exactly `length` characters (60-char local part, ≤50-char labels). */
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

const emailConstraints = async (email: string) =>
  (await validate(build(email)))
    .filter((error) => error.property === 'email')
    .flatMap((error) => Object.keys(error.constraints ?? {}));

describe('CreateStaffDto email length', () => {
  it('accepts a 254-character address', async () => {
    const email = addressOf(254);
    expect(email).toHaveLength(254);
    expect(await emailConstraints(email)).toEqual([]);
  });

  it('refuses a 255-character address with maxLength', async () => {
    const email = addressOf(255);
    expect(email).toHaveLength(255);
    expect(await emailConstraints(email)).toContain('maxLength');
  });
});
