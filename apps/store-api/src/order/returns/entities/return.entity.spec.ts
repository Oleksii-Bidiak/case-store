import {
  RepairResult,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import { ReturnEntity } from './return.entity';
import type { ReturnWithItems } from '../return.types';

/**
 * The two projections of a return (TASK-1963, TASK-2044, TASK-2045).
 *
 * The repository loads one row shape for both audiences; this mapper is what
 * decides which facts the CUSTOMER sees. Everything about staff — who opened the
 * request on their behalf, who decided, the operator's notes and repair notes —
 * stays on the admin side, and a forgotten flag must cost the admin a field
 * rather than show the customer an internal account.
 */

const t0 = new Date('2026-10-01T09:00:00.000Z');
const t1 = new Date('2026-10-02T10:00:00.000Z');
const t2 = new Date('2026-10-03T11:00:00.000Z');
const orderCreatedAt = new Date('2026-09-20T08:00:00.000Z');

const operator = {
  id: 'operator-1',
  email: 'olena@shop.test',
  firstName: 'Олена',
  lastName: 'Коваль',
};
const nameless = { id: 'operator-2', email: 'nameless@shop.test', firstName: null, lastName: null };

const makeRow = (overrides: Partial<ReturnWithItems> = {}): ReturnWithItems => ({
  id: 'return-1',
  orderId: 'order-1',
  status: ReturnStatus.APPROVED,
  reason: 'Не працює кнопка',
  operatorNotes: 'Клієнт сварився',
  requestedAt: t0,
  resolvedAt: t1,
  restockedAt: null,
  refundedAmount: null,
  createdByUserId: operator.id,
  requestedOutcome: ReturnOutcome.REPAIR,
  channel: ReturnChannel.OPERATOR,
  decision: ReturnDecision.REPAIR,
  decisionReason: 'Гарантійний випадок',
  decidedAt: t1,
  decidedById: nameless.id,
  decisionLegacy: false,
  createdAt: t0,
  updatedAt: t1,
  items: [],
  order: {
    id: 'order-1',
    userId: null,
    guestEmail: 'g@x.test',
    status: 'DELIVERED',
    createdAt: orderCreatedAt,
  },
  createdBy: operator,
  decidedBy: nameless,
  decisionEvents: [
    {
      id: 'event-1',
      decision: ReturnDecision.REFUND,
      reason: null,
      legacy: true,
      createdAt: t0,
      actor: null,
    },
    {
      id: 'event-2',
      decision: ReturnDecision.REPAIR,
      reason: 'Гарантійний випадок',
      legacy: false,
      createdAt: t1,
      actor: nameless,
    },
  ],
  repairEvents: [
    {
      id: 'repair-1',
      step: ReturnRepairStep.SENT_TO_SERVICE,
      result: null,
      destination: 'СЦ «Ябко»',
      ttn: '20450000000000',
      note: 'Подряпина на корпусі до ремонту',
      createdAt: t2,
      actor: operator,
    },
  ],
  ...overrides,
});

describe('ReturnEntity — admin projection (includeInternal)', () => {
  const entity = () => ReturnEntity.fromPrisma(makeRow(), { includeInternal: true });

  it('names who opened the request, with a display name from first and last name', () => {
    expect(entity().createdBy).toEqual({
      id: operator.id,
      name: 'Олена Коваль',
      email: operator.email,
    });
  });

  it('falls back to the email when the account has no name', () => {
    expect(entity().decidedBy).toEqual({
      id: nameless.id,
      name: nameless.email,
      email: nameless.email,
    });
  });

  it('uses whichever half of the name exists', () => {
    const row = makeRow({ createdBy: { ...operator, lastName: null } });
    expect(ReturnEntity.fromPrisma(row, { includeInternal: true }).createdBy?.name).toBe('Олена');
  });

  it('answers null for an author that is gone or never was (legacy rows, deleted accounts)', () => {
    const row = makeRow({ createdBy: null, decidedBy: null });
    const result = ReturnEntity.fromPrisma(row, { includeInternal: true });
    expect(result.createdBy).toBeNull();
    expect(result.decidedBy).toBeNull();
  });

  it('carries the decision history in order, legacy rows with no actor', () => {
    expect(entity().decisionHistory).toEqual([
      { decision: 'REFUND', reason: null, legacy: true, createdAt: t0, actor: null },
      {
        decision: 'REPAIR',
        reason: 'Гарантійний випадок',
        legacy: false,
        createdAt: t1,
        actor: { id: nameless.id, name: nameless.email, email: nameless.email },
      },
    ]);
  });

  it('carries the repair steps with the operator note and who recorded each', () => {
    expect(entity().repairSteps).toEqual([
      {
        step: 'SENT_TO_SERVICE',
        result: null,
        destination: 'СЦ «Ябко»',
        ttn: '20450000000000',
        note: 'Подряпина на корпусі до ремонту',
        createdAt: t2,
        actor: { id: operator.id, name: 'Олена Коваль', email: operator.email },
      },
    ]);
  });

  it('carries the purchase date — the 14-day clock starts there', () => {
    expect(entity().orderCreatedAt).toEqual(orderCreatedAt);
  });

  it('carries what was asked for, through which door, and whether the decision is backfilled', () => {
    expect(entity()).toMatchObject({
      requestedOutcome: 'REPAIR',
      channel: 'OPERATOR',
      decisionLegacy: false,
      decidedById: nameless.id,
      createdByUserId: operator.id,
      operatorNotes: 'Клієнт сварився',
    });
  });

  // The queue reads no history (one batched join per to-one relation is the
  // whole cost of a page); the arrays must then be absent, not falsely empty.
  it('leaves the history arrays out when the read did not load them', () => {
    const row = makeRow({ decisionEvents: undefined, repairEvents: undefined });
    const result = ReturnEntity.fromPrisma(row, { includeInternal: true });
    expect(result).not.toHaveProperty('decisionHistory');
    expect(result).not.toHaveProperty('repairSteps');
  });
});

describe('ReturnEntity — customer projection', () => {
  const entity = () => ReturnEntity.fromPrisma(makeRow());

  it('tells the customer what they asked for, the door, and the decision with its reason and date', () => {
    expect(entity()).toMatchObject({
      requestedOutcome: 'REPAIR',
      channel: 'OPERATOR',
      decision: 'REPAIR',
      decisionReason: 'Гарантійний випадок',
      decidedAt: t1,
      decisionLegacy: false,
      restockedAt: null,
    });
  });

  it('shows repair progress without the operator note and without who recorded it', () => {
    expect(entity().repairSteps).toEqual([
      {
        step: 'SENT_TO_SERVICE',
        result: null,
        destination: 'СЦ «Ябко»',
        ttn: '20450000000000',
        createdAt: t2,
      },
    ]);
    expect(entity().repairSteps?.[0]).not.toHaveProperty('note');
    expect(entity().repairSteps?.[0]).not.toHaveProperty('actor');
  });

  it('never carries staff identities, internal notes or the decision history', () => {
    const result = entity();
    for (const key of [
      'operatorNotes',
      'createdByUserId',
      'createdBy',
      'decidedById',
      'decidedBy',
      'decisionHistory',
      'orderCreatedAt',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    // Belt and braces: no staff email anywhere in the serialised body.
    const body = JSON.stringify(result);
    expect(body).not.toContain(operator.email);
    expect(body).not.toContain(nameless.email);
    expect(body).not.toContain('Подряпина');
  });

  it('shows a repair result once the service centre reported one', () => {
    const row = makeRow({
      repairEvents: [
        {
          id: 'repair-2',
          step: ReturnRepairStep.RETURNED_FROM_SERVICE,
          result: RepairResult.REPAIRED,
          destination: null,
          ttn: null,
          createdAt: t2,
        },
      ],
    });
    expect(ReturnEntity.fromPrisma(row).repairSteps).toEqual([
      {
        step: 'RETURNED_FROM_SERVICE',
        result: 'REPAIRED',
        destination: null,
        ttn: null,
        createdAt: t2,
      },
    ]);
  });
});
