import { BadRequestException } from '@nestjs/common';
import { assertGrantablePermissions } from './grantable-permissions';
import { NON_GRANTABLE_PERMISSIONS } from './permission.catalog';

/**
 * The rule that makes `staff:read` / `staff:write` / `audit:read` ungrantable in
 * FACT rather than by convention (TASK-477, plan 181).
 *
 * The catalogue already marks them `grantable: false`, but a flag on a constant
 * stops nothing on its own — what stops it is that the only two writes which can
 * ever put a row in `user_permissions` (a person's own set, and a template's
 * items) both run their input through this function first. So the interesting
 * assertions here are the refusals, and they are written against the catalogue's
 * own list rather than against three hard-coded strings: a fourth non-grantable
 * key added later is covered the day it is declared.
 */
describe('assertGrantablePermissions (TASK-477)', () => {
  it('accepts grantable keys and returns them sorted', () => {
    expect(assertGrantablePermissions(['products:write', 'orders:read'])).toEqual([
      'orders:read',
      'products:write',
    ]);
  });

  it('accepts an empty set — revoking everything is a legitimate edit', () => {
    expect(assertGrantablePermissions([])).toEqual([]);
  });

  it('de-duplicates, because a checkbox grid can send the same key twice', () => {
    expect(assertGrantablePermissions(['orders:read', 'orders:read', 'orders:read'])).toEqual([
      'orders:read',
    ]);
  });

  it('refuses an unknown key and names it', () => {
    expect(() => assertGrantablePermissions(['orders:read', 'orders:teleport'])).toThrow(
      BadRequestException,
    );

    expect(() => assertGrantablePermissions(['orders:teleport'])).toThrow(/orders:teleport/);
  });

  it.each(NON_GRANTABLE_PERMISSIONS.map((permission) => permission.key))(
    'refuses %s — a manager who could receive it could grant themselves the rest',
    (key) => {
      expect(() => assertGrantablePermissions(['orders:read', key])).toThrow(BadRequestException);
      expect(() => assertGrantablePermissions([key])).toThrow(new RegExp(key));
    },
  );

  it('names every offender at once, not just the first', () => {
    // An owner ticking two bad boxes should be told about both; fixing one and
    // resubmitting only to be refused again is how a screen earns a reputation.
    let message = '';
    try {
      assertGrantablePermissions(['staff:write', 'orders:teleport', 'audit:read']);
    } catch (error) {
      message = (error as BadRequestException).message;
    }

    expect(message).toContain('staff:write');
    expect(message).toContain('audit:read');
    expect(message).toContain('orders:teleport');
  });

  it('refuses the whole set when one key is bad — the check is total, not per-key', () => {
    // There is no partial success: the caller either gets the whole set or a 400.
    expect(() => assertGrantablePermissions(['products:write', 'staff:read'])).toThrow(
      BadRequestException,
    );
  });
});
