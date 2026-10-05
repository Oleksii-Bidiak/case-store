/**
 * The old `/orders*` URLs move into the account (TASK-217) — but three of them
 * must keep answering themselves. Matched with `getPathMatch`, the matcher Next
 * builds custom routes with (`strict` + `removeUnnamedParams`, as its router
 * does), so the lookahead is read the way the server will read it; the real 308
 * is asserted in `e2e/account-orders.spec.ts`.
 */
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { LEGACY_ORDER_REDIRECTS } from "./legacy-order-redirects";

function redirectFor(pathname: string): string | null {
  for (const rule of LEGACY_ORDER_REDIRECTS) {
    const params = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
    })(pathname);
    if (params) {
      return rule.destination.replace(
        /:(\w+)/g,
        (_, key: string) => params[key] as string,
      );
    }
  }
  return null;
}

describe("LEGACY_ORDER_REDIRECTS (TASK-217)", () => {
  it("is permanent (308) for every rule", () => {
    expect(LEGACY_ORDER_REDIRECTS.every((rule) => rule.permanent)).toBe(true);
  });

  it.each([
    ["/orders", "/account/orders"],
    [
      "/orders/7f3a91c2-0000-4000-8000-000000000217",
      "/account/orders/7f3a91c2-0000-4000-8000-000000000217",
    ],
    ["/orders/statuses", "/account/orders/statuses"],
  ])("sends %s to %s", (from, to) => {
    expect(redirectFor(from)).toBe(to);
  });

  it.each([
    "/orders/status",
    "/orders/guest",
    "/orders/guest/some-token",
    "/orders/7f3a91c2-0000-4000-8000-000000000217/confirmation",
    "/account/orders",
  ])("leaves %s alone", (pathname) => {
    expect(redirectFor(pathname)).toBeNull();
  });
});
