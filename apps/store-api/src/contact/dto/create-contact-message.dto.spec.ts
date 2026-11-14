import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactMessageDto } from './create-contact-message.dto';

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

function build(overrides: Record<string, unknown> = {}) {
  return plainToInstance(CreateContactMessageDto, {
    name: 'Ivan Petrenko',
    phone: '+380 50 111 2233',
    email: 'ivan@example.com',
    message: 'A question about delivery',
    ...overrides,
  });
}

async function constraintsOf(field: string, overrides: Record<string, unknown>) {
  const errors = await validate(build(overrides));
  return errors.find((e) => e.property === field)?.constraints;
}

/**
 * TASK-1984 (forms convention, Rule 5): the rules both storefront contact forms
 * mirror. The email cap was 255 here alone; it is the 254 of every email DTO.
 */
describe('CreateContactMessageDto', () => {
  it('accepts a complete message', async () => {
    expect(await validate(build())).toHaveLength(0);
  });

  it('accepts a 254-character email', async () => {
    const email = addressOf(254);
    expect(email).toHaveLength(254);
    expect(await constraintsOf('email', { email })).toBeUndefined();
  });

  it('refuses a 255-character email with maxLength', async () => {
    const email = addressOf(255);
    expect(email).toHaveLength(255);
    expect(await constraintsOf('email', { email })).toHaveProperty('maxLength');
  });

  it('refuses a phone with letters in it (shape before digits)', async () => {
    expect(await constraintsOf('phone', { phone: '050 111 2233 ccc' })).toHaveProperty('isUaPhone');
  });

  it.each([
    ['name', 121],
    ['message', 5001],
    ['topic', 61],
    ['orderRef', 121],
  ])('refuses a %s of %i characters with maxLength', async (field, length) => {
    expect(await constraintsOf(field, { [field]: 'x'.repeat(length) })).toHaveProperty('maxLength');
  });
});
