import { ReturnStatus } from '@prisma/client';
import {
  RETURN_TRANSITIONS,
  RESTOCK_ON_STATUS,
  allowedReturnTransitions,
  canTransitionReturn,
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
});
