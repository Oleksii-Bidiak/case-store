import { ReturnDecision, ReturnRepairStep, ReturnStatus } from '@prisma/client';
import {
  REPAIR_STEP_ORDER,
  RETURN_TRANSITIONS,
  RESTOCK_ON_STATUS,
  allowedReturnTransitions,
  canTransitionReturn,
  decisionPermitsTransition,
  nextRepairStep,
  repairAcceptsSteps,
  repairStepRequiresResult,
  returnStatusAfterDecision,
} from './return-state-machine';

const ALL = Object.values(ReturnStatus);

describe('return-state-machine (TASK-340)', () => {
  it('declares an entry for every ReturnStatus', () => {
    expect(Object.keys(RETURN_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it.each(ALL)('rejects the no-op transition %s → %s', (status) => {
    expect(canTransitionReturn(status, status)).toBe(false);
  });

  describe('the happy path', () => {
    it.each([
      [ReturnStatus.REQUESTED, ReturnStatus.APPROVED],
      [ReturnStatus.APPROVED, ReturnStatus.RECEIVED],
      [ReturnStatus.RECEIVED, ReturnStatus.REFUNDED],
    ])('allows %s → %s', (from, to) => {
      expect(canTransitionReturn(from, to)).toBe(true);
    });
  });

  describe('refusal', () => {
    it('allows an outright refusal of a fresh request', () => {
      expect(canTransitionReturn(ReturnStatus.REQUESTED, ReturnStatus.REJECTED)).toBe(true);
    });

    it('allows a refusal after approval (the goods can come back damaged)', () => {
      expect(canTransitionReturn(ReturnStatus.APPROVED, ReturnStatus.REJECTED)).toBe(true);
    });

    it('does not allow refusing goods already taken back into stock', () => {
      expect(canTransitionReturn(ReturnStatus.RECEIVED, ReturnStatus.REJECTED)).toBe(false);
    });
  });

  describe('goods and money are separate events', () => {
    it('refuses to refund before the goods are back', () => {
      // The parcel arrives Tuesday, the accountant refunds Friday. Collapsing the
      // two is how a shop refunds twice.
      expect(canTransitionReturn(ReturnStatus.REQUESTED, ReturnStatus.REFUNDED)).toBe(false);
      expect(canTransitionReturn(ReturnStatus.APPROVED, ReturnStatus.REFUNDED)).toBe(false);
    });

    it('restocks when the goods arrive, not when the money leaves', () => {
      // Waiting for the refund would leave salable inventory invisible in a box.
      expect(RESTOCK_ON_STATUS).toBe(ReturnStatus.RECEIVED);
    });
  });

  describe('terminal statuses', () => {
    it.each([ReturnStatus.REJECTED, ReturnStatus.REFUNDED])('leaves nothing after %s', (from) => {
      expect(allowedReturnTransitions(from)).toEqual([]);
    });

    it('does not let a refusal be quietly rewritten into an approval', () => {
      // A refused customer who then argues successfully files a NEW request. The
      // refusal was communicated; editing it in place erases that it happened.
      expect(canTransitionReturn(ReturnStatus.REJECTED, ReturnStatus.APPROVED)).toBe(false);
    });
  });

  describe('allowedReturnTransitions', () => {
    it('returns a fresh array each time', () => {
      expect(allowedReturnTransitions(ReturnStatus.REQUESTED)).not.toBe(
        allowedReturnTransitions(ReturnStatus.REQUESTED),
      );
    });

    it('agrees with canTransitionReturn in both directions', () => {
      for (const from of ALL) {
        const allowed = new Set(allowedReturnTransitions(from));
        for (const to of ALL) {
          expect(canTransitionReturn(from, to)).toBe(allowed.has(to));
        }
      }
    });
  });

  // ── Decisions (TASK-1961, TASK-2044) ─────────────────────────────────────────
  //
  // APPROVED and REJECTED are no longer statuses an operator sets: they are the
  // EFFECT of a decision. The table above still governs PATCH (goods and money);
  // these two functions govern what a decision does to the status.

  describe('returnStatusAfterDecision', () => {
    const GRANTS = [ReturnDecision.REFUND, ReturnDecision.REPLACEMENT, ReturnDecision.REPAIR];

    describe.each(GRANTS)('%s', (decision) => {
      it('approves a fresh request', () => {
        expect(returnStatusAfterDecision(ReturnStatus.REQUESTED, decision)).toBe(
          ReturnStatus.APPROVED,
        );
      });

      it('re-opens a refused request as approved (B-12: a decision may change, with a reason)', () => {
        expect(returnStatusAfterDecision(ReturnStatus.REJECTED, decision)).toBe(
          ReturnStatus.APPROVED,
        );
      });

      it.each([ReturnStatus.APPROVED, ReturnStatus.RECEIVED])(
        'leaves %s where it is — the goods journey is not the decision',
        (from) => {
          expect(returnStatusAfterDecision(from, decision)).toBe(from);
        },
      );

      it('has no status after REFUNDED — money paid out is final', () => {
        expect(returnStatusAfterDecision(ReturnStatus.REFUNDED, decision)).toBeNull();
      });
    });

    describe('REJECT', () => {
      it.each([ReturnStatus.REQUESTED, ReturnStatus.APPROVED])('refuses from %s', (from) => {
        expect(returnStatusAfterDecision(from, ReturnDecision.REJECT)).toBe(ReturnStatus.REJECTED);
      });

      it('keeps a refused return refused (a reworded refusal)', () => {
        expect(returnStatusAfterDecision(ReturnStatus.REJECTED, ReturnDecision.REJECT)).toBe(
          ReturnStatus.REJECTED,
        );
      });

      it.each([ReturnStatus.RECEIVED, ReturnStatus.REFUNDED])(
        'cannot refuse goods already taken back (%s)',
        (from) => {
          expect(returnStatusAfterDecision(from, ReturnDecision.REJECT)).toBeNull();
        },
      );
    });
  });

  describe('decisionPermitsTransition', () => {
    it('lets money go out only on a REFUND decision', () => {
      expect(decisionPermitsTransition(ReturnStatus.REFUNDED, ReturnDecision.REFUND)).toBe(true);
    });

    it.each([ReturnDecision.REPLACEMENT, ReturnDecision.REPAIR, ReturnDecision.REJECT, null])(
      'refuses REFUNDED under decision %s',
      (decision) => {
        expect(decisionPermitsTransition(ReturnStatus.REFUNDED, decision)).toBe(false);
      },
    );

    it.each([ReturnDecision.REPLACEMENT, ReturnDecision.REPAIR, ReturnDecision.REFUND])(
      'lets the goods be received under decision %s',
      (decision) => {
        expect(decisionPermitsTransition(ReturnStatus.RECEIVED, decision)).toBe(true);
      },
    );
  });

  describe('repair steps (TASK-2045)', () => {
    it('orders the four steps of a repair, and names every step exactly once', () => {
      expect(REPAIR_STEP_ORDER).toEqual([
        ReturnRepairStep.ACCEPTED,
        ReturnRepairStep.SENT_TO_SERVICE,
        ReturnRepairStep.RETURNED_FROM_SERVICE,
        ReturnRepairStep.HANDED_TO_CUSTOMER,
      ]);
      expect([...REPAIR_STEP_ORDER].sort()).toEqual(Object.values(ReturnRepairStep).sort());
    });

    describe('nextRepairStep', () => {
      it('starts with ACCEPTED', () => {
        expect(nextRepairStep([])).toBe(ReturnRepairStep.ACCEPTED);
      });

      it.each([
        [[ReturnRepairStep.ACCEPTED], ReturnRepairStep.SENT_TO_SERVICE],
        [
          [ReturnRepairStep.ACCEPTED, ReturnRepairStep.SENT_TO_SERVICE],
          ReturnRepairStep.RETURNED_FROM_SERVICE,
        ],
        [
          [
            ReturnRepairStep.ACCEPTED,
            ReturnRepairStep.SENT_TO_SERVICE,
            ReturnRepairStep.RETURNED_FROM_SERVICE,
          ],
          ReturnRepairStep.HANDED_TO_CUSTOMER,
        ],
      ])('after %j comes %s', (done, next) => {
        expect(nextRepairStep(done)).toBe(next);
      });

      it('is null once the goods are handed back — a repair ends there', () => {
        expect(nextRepairStep([...REPAIR_STEP_ORDER])).toBeNull();
      });
    });

    describe('repairAcceptsSteps', () => {
      it.each([ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.RECEIVED])(
        'accepts steps on a REPAIR decision at %s',
        (status) => {
          expect(repairAcceptsSteps(status, ReturnDecision.REPAIR)).toBe(true);
        },
      );

      it.each([ReturnStatus.REJECTED, ReturnStatus.REFUNDED])(
        'refuses steps on a closed return (%s), whatever the decision says',
        (status) => {
          expect(repairAcceptsSteps(status, ReturnDecision.REPAIR)).toBe(false);
        },
      );

      it.each([ReturnDecision.REFUND, ReturnDecision.REPLACEMENT, ReturnDecision.REJECT, null])(
        'refuses steps under decision %s — an unrepairable item moved to another decision stops here',
        (decision) => {
          expect(repairAcceptsSteps(ReturnStatus.APPROVED, decision)).toBe(false);
        },
      );
    });

    describe('repairStepRequiresResult', () => {
      it('requires the outcome on the way back from the service, and nowhere else', () => {
        expect(repairStepRequiresResult(ReturnRepairStep.RETURNED_FROM_SERVICE)).toBe(true);
        expect(repairStepRequiresResult(ReturnRepairStep.ACCEPTED)).toBe(false);
        expect(repairStepRequiresResult(ReturnRepairStep.SENT_TO_SERVICE)).toBe(false);
        expect(repairStepRequiresResult(ReturnRepairStep.HANDED_TO_CUSTOMER)).toBe(false);
      });
    });
  });
});
