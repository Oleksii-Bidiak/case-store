/**
 * GuestOrderClaimPort — the narrow seam the AUTH side depends on to hand a
 * shopper the orders they placed before they had an account, without knowing
 * anything about orders (TASK-485, closing the tail of TASK-338).
 *
 * ── Why a port and not an import ─────────────────────────────────────────────
 * `claimGuestOrders` has lived, implemented and tested, on `OrderService` since
 * TASK-338 with no caller anywhere, because the obvious call site cannot reach
 * it: the module graph already runs `OrderModule → UserModule → AuthModule`, so
 * an `AuthModule → OrderModule` import closes a cycle. `forwardRef` on that edge
 * would compile and would trade a boot-order hazard for a one-line convenience,
 * in the one place where failure means the API does not start at all.
 *
 * So the dependency is inverted instead, exactly as `PublishablePort` does it
 * (Етап 2): an interface plus a `Symbol` token, `OrderModule` aliasing its own
 * service onto that token with `useExisting`, and the consumer resolving the
 * token out of the container rather than importing the module. No new module
 * edge exists, so there is no cycle to break.
 *
 * This file deliberately has ZERO imports — not even `@nestjs/common`. A port
 * that imported either side would reintroduce, at file level, the very cycle it
 * exists to avoid (the same reason `category-subtree-indexer.port.ts` is bare).
 *
 * ── Why the caller is email VERIFICATION and not registration ────────────────
 * Claiming transfers somebody's phone number, order totals and delivery address
 * onto whichever account names their email. Signing in with an unverified
 * address is not blocked today, so claiming at registration would hand all of
 * that to anyone who typed a stranger's address into the signup form.
 * Confirming the address is precisely the missing proof, and the mechanism for
 * it already exists (B-5 §5).
 */
export interface GuestOrderClaimPort {
  /**
   * Attach every not-yet-claimed guest order placed with `email` to `userId`,
   * returning how many were attached.
   *
   * Implementations MUST be idempotent — a second call claims zero — and MUST
   * keep the guest contact columns, which are the snapshot of what the buyer
   * actually typed at checkout and what the emailed status link still answers
   * to.
   */
  claimGuestOrders(userId: string, email: string): Promise<number>;
}

/**
 * DI token the order side registers its implementation under:
 *
 * ```ts
 * { provide: GUEST_ORDER_CLAIM_PORT, useExisting: OrderService }
 * ```
 *
 * Consumers resolve it through `ModuleRef` with `{ strict: false }` rather than
 * injecting it in a constructor: constructor injection would require
 * `AuthModule` to import `OrderModule`, which is the cycle this port exists to
 * avoid. The lookup happens on the verification path, long after boot.
 */
export const GUEST_ORDER_CLAIM_PORT = Symbol('GUEST_ORDER_CLAIM_PORT');
