import { BadRequestException } from '@nestjs/common';
import { GRANTABLE_PERMISSION_KEYS, PERMISSION_KEYS } from './permission.catalog';

/**
 * The gate every permission grant passes through (TASK-477, plan 181).
 *
 * ── WHY THIS IS A FUNCTION AND NOT A `@IsIn()` ON A DTO ───────────────────────
 *
 * Two different writes can put a key into somebody's access: replacing one
 * person's set (`PUT /api/admin/staff/:id/permissions`) and storing a template's
 * items, which are later copied onto a person. A validator on one DTO protects
 * one of them, and the one it does not protect is the back door — a key that may
 * not be ticked on a person, parked in a template, and applied. So the rule is
 * one exported function and both writes call it; `permission-template.service.ts`
 * and `staff.service.ts` are the only two call sites, and a third write that
 * skipped it would be visible as exactly that in a diff.
 *
 * ── WHAT "NON-GRANTABLE" BUYS, AND WHY IT IS ENFORCED HERE ────────────────────
 *
 * `staff:read`, `staff:write` and `audit:read` are real keys the guard enforces,
 * and they are held BY LEVEL — every admin passes them without a row. Marking
 * them `grantable: false` in the catalogue keeps them off the granting screen,
 * but a flag on a constant stops nobody who can POST. This function is what makes
 * the flag true in fact:
 *
 *   - a manager holding `staff:write` could grant themselves every other key in
 *     the catalogue, which makes every other tick on that screen decorative;
 *   - a manager holding `audit:read` could check whether their own actions were
 *     noticed, and they are the one reader the log is kept from.
 *
 * ── DESIGN NOTES ──────────────────────────────────────────────────────────────
 *
 * TOTAL, NOT PER-KEY. One bad key refuses the whole submission. A partial write
 * would leave the person holding a set nobody chose, and "the rows that exist are
 * exactly the rows that were granted" is the property the replace-don't-diff
 * write exists to keep.
 *
 * EVERY OFFENDER IS NAMED, not just the first: an owner who ticked two bad boxes
 * should not have to submit twice to learn about the second.
 *
 * UNKNOWN AND NON-GRANTABLE ARE REPORTED SEPARATELY because they mean different
 * things to whoever reads the 400. An unknown key is usually a stale client or a
 * typo; a non-grantable one is a deliberate refusal with a reason behind it.
 *
 * SORTED OUTPUT, so a before/after audit diff compares sets rather than orderings
 * and an unchanged submission produces an empty-looking change rather than a
 * reshuffle.
 */
export function assertGrantablePermissions(keys: readonly string[]): string[] {
  const unique = [...new Set(keys)];

  const unknown = unique.filter((key) => !PERMISSION_KEYS.has(key));
  const reserved = unique.filter(
    (key) => PERMISSION_KEYS.has(key) && !GRANTABLE_PERMISSION_KEYS.has(key),
  );

  if (unknown.length > 0 || reserved.length > 0) {
    const problems: string[] = [];
    if (unknown.length > 0) {
      problems.push(`unknown permission(s): ${unknown.sort().join(', ')}`);
    }
    if (reserved.length > 0) {
      problems.push(
        'permission(s) that are never granted to a person: ' +
          `${reserved.sort().join(', ')} — staff management and the action log are held by ` +
          'access level, not by grant',
      );
    }
    throw new BadRequestException(`Cannot grant ${problems.join('; ')}`);
  }

  return unique.sort();
}
