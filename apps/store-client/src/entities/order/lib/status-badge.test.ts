import {
  OrderEntityPaymentStatus,
  OrderEntityStatus,
} from "@/shared/api/generated/models";
import {
  STATUS_BADGE,
  STATUS_BADGE_FALLBACK,
  statusBadgeStyle,
} from "./status-badge";

describe("statusBadgeStyle (TASK-802)", () => {
  it("has a style for every order status the API can send", () => {
    for (const status of Object.values(OrderEntityStatus)) {
      expect(STATUS_BADGE[status]).toBeDefined();
    }
  });

  it("has a style for every payment status the API can send", () => {
    for (const status of Object.values(OrderEntityPaymentStatus)) {
      expect(STATUS_BADGE[status]).toBeDefined();
    }
  });

  it("paints PARTIALLY_REFUNDED as a refund, not as the PENDING colour", () => {
    expect(statusBadgeStyle("PARTIALLY_REFUNDED")).toEqual(
      statusBadgeStyle("REFUNDED"),
    );
    expect(statusBadgeStyle("PARTIALLY_REFUNDED")).not.toEqual(
      statusBadgeStyle("PENDING"),
    );
  });

  it("falls back to the neutral style for an unknown value", () => {
    expect(statusBadgeStyle("SOMETHING_NEW")).toBe(STATUS_BADGE_FALLBACK);
  });
});

describe("status colours by design-system §2 (TASK-868)", () => {
  it.each(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"])(
    "%s is in progress — a primary tint",
    (status) => {
      expect(statusBadgeStyle(status).variant).toBe("tint-primary");
    },
  );

  it("darkens the primary tint stage by stage", () => {
    expect(statusBadgeStyle("PENDING").shade).toBeUndefined();
    expect(statusBadgeStyle("CONFIRMED").shade).toBe("bg-primary/15");
    expect(statusBadgeStyle("PROCESSING").shade).toBe("bg-primary/20");
    expect(statusBadgeStyle("SHIPPED").shade).toBe("bg-primary/30");
  });

  it.each(["DELIVERED", "PAID"])("%s is success", (status) => {
    expect(statusBadgeStyle(status).variant).toBe("tint-success");
  });

  it.each(["REFUNDED", "PARTIALLY_REFUNDED"])(
    "%s is muted, not an error",
    (status) => {
      expect(statusBadgeStyle(status).variant).toBe("tint-muted");
    },
  );

  it.each(["CANCELLED", "FAILED"])("%s is destructive", (status) => {
    expect(statusBadgeStyle(status).variant).toBe("tint-destructive");
  });

  it("uses token classes only — no raw colours, no arbitrary values", () => {
    for (const style of Object.values(STATUS_BADGE)) {
      if (style.shade) expect(style.shade).toMatch(/^bg-primary\/\d+$/);
    }
  });
});
