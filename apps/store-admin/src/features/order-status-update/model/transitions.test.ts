import type { AdminOrderAllowedTransitionsResponse } from "@/entities/order";
import { toTransitionOptions } from "./transitions";

describe("toTransitionOptions (TASK-332)", () => {
  it("passes the server's list through unchanged, with its lock token", () => {
    const options = toTransitionOptions({
      data: {
        current: "SHIPPED",
        allowed: ["DELIVERED", "CANCELLED", "REFUNDED"],
        updatedAt: "2026-07-28T10:15:30.000Z",
      },
    });

    expect(options.allowed).toEqual(["DELIVERED", "CANCELLED", "REFUNDED"]);
    expect(options.expectedUpdatedAt).toBe("2026-07-28T10:15:30.000Z");
  });

  it("offers NOTHING while the read is in flight, rather than guessing", () => {
    // The regression this guards: the pre-TASK-332 client derived the options
    // itself ("every status except the current one"), which meant it always had
    // an answer — including a wrong one. An empty list is the honest state.
    const options = toTransitionOptions(undefined);

    expect(options.allowed).toEqual([]);
    expect(options.expectedUpdatedAt).toBeUndefined();
  });

  it("does not hand the caller a reference into the response", () => {
    const response: AdminOrderAllowedTransitionsResponse = {
      data: {
        current: "PENDING",
        allowed: ["CONFIRMED"],
        updatedAt: "2026-07-28T10:15:30.000Z",
      },
    };

    toTransitionOptions(response).allowed.push("SHIPPED");

    expect(response.data.allowed).toEqual(["CONFIRMED"]);
  });
});
