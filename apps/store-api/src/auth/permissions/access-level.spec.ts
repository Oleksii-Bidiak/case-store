import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  AccessLevel,
  assertMayAssign,
  assertMayManage,
  levelOf,
  levelOfRole,
  type LevelledAccount,
} from './access-level';

/**
 * The level rule, tested where it actually lives (TASK-476, plan 181).
 *
 * These are invariants 2 and 3 of plan 181 in their purest form — no HTTP, no
 * Prisma, no Nest. Every one of the four doors (role, password, status, delete)
 * ends up in `assertMayManage`, so a case proved here is proved for all four at
 * once. That is the entire reason the rule is a function rather than four
 * lookalike `if` blocks.
 */

const owner: LevelledAccount = { id: 'owner-1', role: UserRole.ADMIN, isOwner: true };
const deputy: LevelledAccount = { id: 'deputy-1', role: UserRole.ADMIN, isOwner: false };
const otherDeputy: LevelledAccount = { id: 'deputy-2', role: UserRole.ADMIN, isOwner: false };
const manager: LevelledAccount = { id: 'manager-1', role: UserRole.MANAGER, isOwner: false };
const customer: LevelledAccount = { id: 'customer-1', role: UserRole.CUSTOMER, isOwner: false };

describe('levelOf', () => {
  it('ranks owner > admin > manager > customer', () => {
    expect(levelOf(owner)).toBe(AccessLevel.OWNER);
    expect(levelOf(deputy)).toBe(AccessLevel.ADMIN);
    expect(levelOf(manager)).toBe(AccessLevel.MANAGER);
    expect(levelOf(customer)).toBe(AccessLevel.CUSTOMER);

    expect(AccessLevel.OWNER).toBeGreaterThan(AccessLevel.ADMIN);
    expect(AccessLevel.ADMIN).toBeGreaterThan(AccessLevel.MANAGER);
    expect(AccessLevel.MANAGER).toBeGreaterThan(AccessLevel.CUSTOMER);
  });

  it('lets the owner flag win over the role, whatever the role says', () => {
    // Not a state the shop can reach today (the owner is seeded ADMIN), but the
    // flag is the level and the role is not. Reading the role first would make
    // a hand-run UPDATE in the database silently demote the owner.
    expect(levelOf({ id: 'x', role: UserRole.MANAGER, isOwner: true })).toBe(AccessLevel.OWNER);
    expect(levelOf({ id: 'x', role: UserRole.CUSTOMER, isOwner: true })).toBe(AccessLevel.OWNER);
  });

  it('maps a bare role the same way for the assign check', () => {
    expect(levelOfRole(UserRole.ADMIN)).toBe(AccessLevel.ADMIN);
    expect(levelOfRole(UserRole.MANAGER)).toBe(AccessLevel.MANAGER);
    expect(levelOfRole(UserRole.CUSTOMER)).toBe(AccessLevel.CUSTOMER);
  });
});

describe('assertMayManage', () => {
  it('lets the owner manage every level below them', () => {
    expect(() => assertMayManage(owner, deputy)).not.toThrow();
    expect(() => assertMayManage(owner, manager)).not.toThrow();
    expect(() => assertMayManage(owner, customer)).not.toThrow();
  });

  it('lets a deputy admin manage managers and customers', () => {
    expect(() => assertMayManage(deputy, manager)).not.toThrow();
    expect(() => assertMayManage(deputy, customer)).not.toThrow();
  });

  it('refuses a deputy admin on another admin — equal is not below', () => {
    expect(() => assertMayManage(deputy, otherDeputy)).toThrow(ForbiddenException);
  });

  it('refuses a deputy admin on the owner', () => {
    expect(() => assertMayManage(deputy, owner)).toThrow(ForbiddenException);
  });

  it('refuses ANY actor on the owner — including the owner themselves', () => {
    // Plan 181, invariant 2, in one line: the owner is the maximum level and
    // nothing is strictly above the maximum, so no caller of this function can
    // reach the owner's account. Ownership moves by transfer (TASK-478) and by
    // nothing else.
    for (const actor of [owner, deputy, manager, customer]) {
      expect(() => assertMayManage(actor, owner)).toThrow(ForbiddenException);
    }
  });

  it('refuses an actor acting on their own level even when the target is themselves', () => {
    expect(() => assertMayManage(deputy, deputy)).toThrow(ForbiddenException);
    expect(() => assertMayManage(manager, manager)).toThrow(ForbiddenException);
  });

  it('refuses a manager on a manager but allows a manager on a customer', () => {
    // The manager→customer case is not theoretical: `customers:write` on
    // /api/users deactivates shoppers, and this is the check that route runs.
    expect(() => assertMayManage(manager, { ...manager, id: 'manager-2' })).toThrow(
      ForbiddenException,
    );
    expect(() => assertMayManage(manager, customer)).not.toThrow();
  });

  it('refuses a customer on anybody at all', () => {
    for (const target of [owner, deputy, manager, customer]) {
      expect(() => assertMayManage(customer, target)).toThrow(ForbiddenException);
    }
  });

  it('states the rule without naming the target', () => {
    let message = '';
    try {
      assertMayManage(deputy, owner);
    } catch (error) {
      message = (error as ForbiddenException).message;
    }

    expect(message).toMatch(/level/i);
    // A refusal that echoes the target turns 403 into a lookup oracle: "is this
    // id the owner?" answered by reading the error text.
    expect(message).not.toContain(owner.id);
    expect(message).not.toContain('owner-1');
  });
});

describe('assertMayAssign', () => {
  it('lets the owner appoint an admin, a manager or a customer', () => {
    expect(() => assertMayAssign(owner, AccessLevel.ADMIN)).not.toThrow();
    expect(() => assertMayAssign(owner, AccessLevel.MANAGER)).not.toThrow();
    expect(() => assertMayAssign(owner, AccessLevel.CUSTOMER)).not.toThrow();
  });

  it('refuses even the owner the OWNER level — ownership moves only by transfer', () => {
    expect(() => assertMayAssign(owner, AccessLevel.OWNER)).toThrow(ForbiddenException);
  });

  it('refuses a deputy admin the ADMIN level — equal is not below', () => {
    // The whole point of the rule: only the owner appoints admins. An admin who
    // could appoint another admin could hand the shop to anyone.
    expect(() => assertMayAssign(deputy, AccessLevel.ADMIN)).toThrow(ForbiddenException);
  });

  it('lets a deputy admin assign MANAGER and CUSTOMER', () => {
    expect(() => assertMayAssign(deputy, AccessLevel.MANAGER)).not.toThrow();
    expect(() => assertMayAssign(deputy, AccessLevel.CUSTOMER)).not.toThrow();
  });

  it('lets a manager assign nothing above a customer', () => {
    expect(() => assertMayAssign(manager, AccessLevel.MANAGER)).toThrow(ForbiddenException);
    expect(() => assertMayAssign(manager, AccessLevel.ADMIN)).toThrow(ForbiddenException);
    expect(() => assertMayAssign(manager, AccessLevel.CUSTOMER)).not.toThrow();
  });

  it('states the rule without naming a level the caller could probe', () => {
    let message = '';
    try {
      assertMayAssign(deputy, AccessLevel.ADMIN);
    } catch (error) {
      message = (error as ForbiddenException).message;
    }

    expect(message).toMatch(/level/i);
  });
});
