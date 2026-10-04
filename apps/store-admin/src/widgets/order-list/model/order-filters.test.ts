import {
  EMPTY_FILTERS,
  activeQuickView,
  orderFilterChips,
  orderFiltersToQuery,
  orderFiltersToUrl,
  periodLabel,
  periodRange,
  presetOf,
  readOrderFilters,
} from "./order-filters";

describe("order-filters — the URL contract", () => {
  it("reads every filter off the URL and writes the same URL back", () => {
    const params = new URLSearchParams(
      "status=CONFIRMED,PROCESSING&paymentStatus=PAID&paymentMethod=ONLINE&dateFrom=2026-09-01&dateTo=2026-09-24&hasDebt=true&unpaidInTransit=true&pendingOverdue=false",
    );
    const filters = readOrderFilters(params);

    expect(filters).toEqual({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-24",
      status: ["CONFIRMED", "PROCESSING"],
      paymentStatus: "PAID",
      paymentMethod: "ONLINE",
      signals: ["hasDebt", "unpaidInTransit"],
    });
    expect(orderFiltersToUrl(filters)).toMatchObject({
      status: "CONFIRMED,PROCESSING",
      hasDebt: "true",
      unpaidInTransit: "true",
      pendingOverdue: undefined,
    });
  });

  it("writes statuses in lifecycle order, so the sheet reproduces a quick view", () => {
    expect(
      orderFiltersToUrl({
        ...EMPTY_FILTERS,
        status: ["PROCESSING", "CONFIRMED"],
      }).status,
    ).toBe("CONFIRMED,PROCESSING");
  });

  it("leaves unset filters off the API query", () => {
    const query = orderFiltersToQuery(EMPTY_FILTERS, "");
    expect(Object.values(query).filter((v) => v !== undefined)).toEqual([]);
    expect(
      orderFiltersToQuery(
        { ...EMPTY_FILTERS, signals: ["paidAfterCancel"] },
        "0671",
      ),
    ).toMatchObject({ paidAfterCancel: true, search: "0671" });
  });

  it("maps a status to its quick view, «Усі» to no status, and a stray status to none", () => {
    expect(activeQuickView("")).toBe("__all__");
    expect(activeQuickView("PENDING")).toBe("PENDING");
    expect(activeQuickView("CONFIRMED,PROCESSING")).toBe(
      "CONFIRMED,PROCESSING",
    );
    expect(activeQuickView("DELIVERED")).toBe("");
  });
});

describe("order-filters — period presets (Kyiv calendar days)", () => {
  const today = "2026-09-24";

  it.each([
    ["today", "2026-09-24", "2026-09-24"],
    ["yesterday", "2026-09-23", "2026-09-23"],
    ["7d", "2026-09-18", "2026-09-24"],
    ["30d", "2026-08-26", "2026-09-24"],
    ["month", "2026-09-01", "2026-09-24"],
  ])("«%s» is %s – %s", (preset, from, to) => {
    expect(periodRange(preset, today)).toEqual({ from, to });
    expect(presetOf(from, to, today)).toBe(preset);
  });

  it("crosses a year boundary for «вчора» on 1 January", () => {
    expect(periodRange("yesterday", "2027-01-01")).toEqual({
      from: "2026-12-31",
      to: "2026-12-31",
    });
  });

  it("calls any other range custom, and no range none", () => {
    expect(presetOf("2026-09-02", "2026-09-10", today)).toBe("custom");
    expect(presetOf("", "", today)).toBe("");
    expect(periodRange("custom", today)).toBeNull();
  });

  it("labels a range like the artboard: «01.09 – 24.09.2026»", () => {
    expect(periodLabel("2026-09-01", "2026-09-24")).toBe("01.09 – 24.09.2026");
    expect(periodLabel("2025-12-20", "2026-01-05")).toBe(
      "20.12.2025 – 05.01.2026",
    );
    expect(periodLabel("2026-09-01", "")).toBe("з 01.09.2026");
    expect(periodLabel("", "2026-09-24")).toBe("до 24.09.2026");
  });
});

describe("order-filters — chips", () => {
  it("draws no status chip for a quick view, one for any other status set", () => {
    expect(
      orderFilterChips({ ...EMPTY_FILTERS, status: ["PENDING"] }),
    ).toHaveLength(0);
    const [chip] = orderFilterChips({
      ...EMPTY_FILTERS,
      status: ["DELIVERED", "CANCELLED"],
    });
    expect(chip.label).toBe("Статус: Доставлено, Скасовано");
    expect(chip.clear).toEqual({ status: undefined });
  });

  it("clears a period with one chip", () => {
    const [chip] = orderFilterChips({
      ...EMPTY_FILTERS,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-24",
    });
    expect(chip.label).toBe("Період: 01.09 – 24.09.2026");
    expect(chip.clear).toEqual({ dateFrom: undefined, dateTo: undefined });
  });
});
