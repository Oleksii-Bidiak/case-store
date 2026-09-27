import {
  OrderEntityPaymentStatus,
  OrderEntityStatus,
} from "@/shared/api/generated/models";
import {
  STATUS_BADGE,
  STATUS_BADGE_FALLBACK,
  statusBadgeClass,
} from "./status-badge";

describe("statusBadgeClass (TASK-802)", () => {
  it("has a colour for every order status the API can send", () => {
    for (const status of Object.values(OrderEntityStatus)) {
      expect(STATUS_BADGE[status]).toBeDefined();
    }
  });

  it("has a colour for every payment status the API can send", () => {
    for (const status of Object.values(OrderEntityPaymentStatus)) {
      expect(STATUS_BADGE[status]).toBeDefined();
    }
  });

  it("paints PARTIALLY_REFUNDED as a refund, not as the grey PENDING fallback", () => {
    expect(statusBadgeClass("PARTIALLY_REFUNDED")).toBe(
      statusBadgeClass("REFUNDED"),
    );
    expect(statusBadgeClass("PARTIALLY_REFUNDED")).not.toBe(
      statusBadgeClass("PENDING"),
    );
  });

  it("falls back to the neutral colour for an unknown value", () => {
    expect(statusBadgeClass("SOMETHING_NEW")).toBe(STATUS_BADGE_FALLBACK);
  });
});
