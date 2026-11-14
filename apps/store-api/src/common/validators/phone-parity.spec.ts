import 'reflect-metadata';
import * as path from 'path';
import { plainToInstance, Transform } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  IsInternationalPhone,
  PHONE_MAX_DIGITS,
  PHONE_MIN_DIGITS,
  PHONE_SHAPE,
} from './is-international-phone.decorator';
import { IsUaPhone, UA_PHONE_LOCAL_LENGTH, UA_PHONE_PATTERN } from './is-ua-phone.decorator';
import { normalizePhone } from './normalize-phone.transform';

/**
 * One phone rule, three copies (TASK-1984 — forms convention, Rule 5a).
 *
 * The API, the storefront and the admin panel cannot import each other, so each
 * spells the phone constants out itself. This spec is what keeps the copies
 * honest: it loads the two client `shared/lib/phone.ts` files AS CODE (they are
 * import-free pure TS for exactly this reason — keep zod and React out of them)
 * and checks both the constants and the verdicts on one shared case table.
 *
 * They are loaded through `jest.requireActual` rather than an `import` because
 * `tsconfig.spec.json` roots the typecheck at `apps/store-api`; ts-jest
 * transpiles them like any other file, and the interfaces below pin the surface
 * this spec relies on.
 */

interface StorefrontPhone {
  PHONE_SHAPE: RegExp;
  UA_PHONE_PATTERN: RegExp;
  UA_PHONE_LOCAL_LENGTH: number;
  isValidUAPhone(raw: string): boolean;
}

interface AdminPhone extends StorefrontPhone {
  PHONE_MIN_DIGITS: number;
  PHONE_MAX_DIGITS: number;
  isValidInternationalPhone(raw: string, options?: { normalized?: boolean }): boolean;
}

const APPS = path.resolve(__dirname, '../../../..');
const storefront = jest.requireActual<StorefrontPhone>(
  path.join(APPS, 'store-client/src/shared/lib/phone.ts'),
);
const admin = jest.requireActual<AdminPhone>(
  path.join(APPS, 'store-admin/src/shared/lib/phone.ts'),
);

// The server path, as the DTOs run it: `normalizePhone` under the global
// `transform: true` pipe, then the decorator.
class UaFixture {
  @Transform(normalizePhone)
  @IsUaPhone()
  phone!: string;
}

class InternationalFixture {
  @Transform(normalizePhone)
  @IsInternationalPhone()
  phone!: string;
}

// The DTOs that store the number AS TYPED — no `normalizePhone` (the pickup
// point, the site contacts): the decorator counts the typed digits.
class InternationalAsTypedFixture {
  @IsInternationalPhone()
  phone!: string;
}

function apiAccepts(
  dto: typeof UaFixture | typeof InternationalFixture | typeof InternationalAsTypedFixture,
  phone: string,
): boolean {
  return validateSync(plainToInstance(dto, { phone })).length === 0;
}

/**
 * [value, UA, international, international as typed] — the same table on every
 * side. Only verdicts are compared: the clients never normalise what they send
 * (the DTO does), so there is no client-side normalised value to compare.
 */
const CASES: [string, boolean, boolean, boolean][] = [
  ['050 111 2233 ccc', false, false, false],
  ['----------', false, false, false],
  ['+1 234 567 8901', false, true, true],
  ['+48 123 456 789', false, true, true],
  ['050 111 2233', true, true, true],
  ['0501112233', true, true, true],
  ['+380501112233', true, true, true],
  ['+380 50 111 2233', true, true, true],
  ['+38 (050) 111-22-33', true, true, true],
  ['380501112233', true, true, true],
  ['80501112233', true, true, true],
  ['0501112233 ', true, true, true],
  ['050 111 2233', true, true, true],
  ['０５０１１１２２３３', false, false, false],
  ['12345', false, false, false],
  // A UA free-phone line: 12 digits once normalised, so both rules take it.
  ['0 800 30 30 30', true, true, true],
  // Where normalising changes the digit count, the two international paths part.
  ['0123456', false, true, false],
  ['05011122', false, true, false],
  ['012345678901234', false, false, true],
  ['(((((((((', false, false, false],
  ['', false, false, false],
];

describe('phone rule parity: API ↔ storefront ↔ admin (TASK-1984)', () => {
  describe('constants are spelled identically', () => {
    it.each([
      ['storefront', storefront],
      ['admin', admin],
    ])('%s: PHONE_SHAPE, UA_PHONE_PATTERN, UA_PHONE_LOCAL_LENGTH', (_name, client) => {
      expect(client.PHONE_SHAPE.source).toBe(PHONE_SHAPE.source);
      expect(client.PHONE_SHAPE.flags).toBe(PHONE_SHAPE.flags);
      expect(client.UA_PHONE_PATTERN.source).toBe(UA_PHONE_PATTERN.source);
      expect(client.UA_PHONE_PATTERN.flags).toBe(UA_PHONE_PATTERN.flags);
      expect(client.UA_PHONE_LOCAL_LENGTH).toBe(UA_PHONE_LOCAL_LENGTH);
    });

    // The storefront has no international rule (it only takes UA numbers), so
    // the digit bounds live in the admin copy alone.
    it('admin: PHONE_MIN_DIGITS, PHONE_MAX_DIGITS', () => {
      expect(admin.PHONE_MIN_DIGITS).toBe(PHONE_MIN_DIGITS);
      expect(admin.PHONE_MAX_DIGITS).toBe(PHONE_MAX_DIGITS);
    });
  });

  describe.each(CASES)('%p', (phone, ua, international, asTyped) => {
    it(`UA rule → ${ua ? 'accepted' : 'refused'} by the API, the storefront and the admin`, () => {
      expect({
        api: apiAccepts(UaFixture, phone),
        storefront: storefront.isValidUAPhone(phone),
        admin: admin.isValidUAPhone(phone),
      }).toEqual({ api: ua, storefront: ua, admin: ua });
    });

    it(`international rule → ${international ? 'accepted' : 'refused'} by the API and the admin`, () => {
      expect({
        api: apiAccepts(InternationalFixture, phone),
        admin: admin.isValidInternationalPhone(phone),
      }).toEqual({ api: international, admin: international });
    });

    it(`international rule, stored as typed → ${asTyped ? 'accepted' : 'refused'} by the API and the admin`, () => {
      expect({
        api: apiAccepts(InternationalAsTypedFixture, phone),
        admin: admin.isValidInternationalPhone(phone, { normalized: false }),
      }).toEqual({ api: asTyped, admin: asTyped });
    });
  });
});
