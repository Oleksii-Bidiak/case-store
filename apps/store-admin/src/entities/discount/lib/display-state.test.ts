import { dict } from "@/shared/config";
import {
  discountConditions,
  discountDisplayState,
  discountPeriod,
  discountStatusLabel,
  discountValueLabel,
  type DiscountStateFields,
} from "./display-state";

const d = dict.discounts;

// 12:00 Kyiv on 1 October 2026.
const NOW = Date.parse("2026-10-01T09:00:00.000Z");

function make(
  overrides: Partial<DiscountStateFields> = {},
): DiscountStateFields {
  return {
    type: "PERCENT",
    value: "10",
    minSpend: null,
    maxRedemptions: null,
    perUserLimit: null,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

describe("discountDisplayState (DiscountsProposal ПК1)", () => {
  it("is «live» for an enabled code with no window", () => {
    expect(discountDisplayState(make(), NOW)).toBe("live");
  });

  it("is «expired» once the inclusive end has passed — EXPIRED15 no longer looks active", () => {
    expect(
      discountDisplayState(
        make({ expiresAt: "2026-09-26T20:59:59.999Z" }),
        NOW,
      ),
    ).toBe("expired");
  });

  it("is «scheduled» before the start", () => {
    expect(
      discountDisplayState(make({ startsAt: "2026-10-14T21:00:00.000Z" }), NOW),
    ).toBe("scheduled");
  });

  it("is «disabled» whatever the dates say when the switch is off", () => {
    expect(
      discountDisplayState(
        make({ isActive: false, expiresAt: "2026-09-26T20:59:59.999Z" }),
        NOW,
      ),
    ).toBe("disabled");
  });
});

describe("discountStatusLabel", () => {
  it("names the date in the badge — short, the Kyiv day", () => {
    expect(
      discountStatusLabel(make({ expiresAt: "2026-09-26T20:59:59.999Z" }), NOW),
    ).toBe(d.statusExpired("26.09"));
    expect(
      discountStatusLabel(make({ startsAt: "2026-10-14T21:00:00.000Z" }), NOW),
    ).toBe(d.statusScheduled("15.10"));
    expect(discountStatusLabel(make(), NOW)).toBe(d.statusLive);
    expect(discountStatusLabel(make({ isActive: false }), NOW)).toBe(
      d.statusDisabled,
    );
  });
});

describe("discountValueLabel", () => {
  it("prints «−10%» and «−500 ₴» through the money formatter", () => {
    expect(discountValueLabel(make())).toBe("−10%");
    expect(
      discountValueLabel(make({ type: "FIXED", value: "500.00" })),
    ).toMatch(/^−500\s₴$/);
  });
});

describe("discountConditions", () => {
  it("says the minimum and the per-customer cap in words", () => {
    expect(discountConditions(make({ minSpend: "3000.00" }))).toMatch(
      /^від 3\s000\s₴$/,
    );
    expect(discountConditions(make({ perUserLimit: 1 }))).toBe(
      d.condPerUser(1),
    );
    expect(discountConditions(make({ perUserLimit: 1 }))).toBe(
      "1 раз на клієнта",
    );
  });

  it("joins both, and says «без умов» when there is none", () => {
    expect(
      discountConditions(make({ minSpend: "100", perUserLimit: 2 })),
    ).toMatch(/^від 100\s₴ · 2 рази на клієнта$/);
    expect(discountConditions(make())).toBe(d.condNone);
  });
});

describe("discountPeriod", () => {
  it("is «без строку» with no window", () => {
    expect(discountPeriod(make())).toBe(d.periodNone);
  });

  it("drops the start's year when both ends share it", () => {
    expect(
      discountPeriod(
        make({
          startsAt: "2026-07-31T21:00:00.000Z",
          expiresAt: "2026-09-26T20:59:59.999Z",
        }),
      ),
    ).toBe(d.periodRange("01.08", "26.09.2026"));
  });

  it("keeps both years across a new year", () => {
    expect(
      discountPeriod(
        make({
          startsAt: "2026-12-19T22:00:00.000Z",
          expiresAt: "2027-01-10T21:59:59.999Z",
        }),
      ),
    ).toBe(d.periodRange("20.12.2026", "10.01.2027"));
  });

  it("says only the bound that exists", () => {
    expect(discountPeriod(make({ startsAt: "2026-10-14T21:00:00.000Z" }))).toBe(
      d.periodFrom("15.10.2026"),
    );
    expect(
      discountPeriod(make({ expiresAt: "2026-09-26T20:59:59.999Z" })),
    ).toBe(d.periodUntil("26.09.2026"));
  });
});
