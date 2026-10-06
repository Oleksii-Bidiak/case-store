import {
  EMPTY_FILTERS,
  activeQuickView,
  hasNonStatusFilters,
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
      deliveryMethod: [],
      pickupPointId: "",
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

describe("order-filters — delivery (TASK-648)", () => {
  const POINT = "0b0c6f2e-3a6d-4a43-9f0e-4c1b2f6a7d10";

  it("round-trips the delivery methods and the pickup point through the URL", () => {
    const params = new URLSearchParams(
      `deliveryMethod=OTHER,PICKUP&pickupPointId=${POINT}&status=PENDING`,
    );
    const filters = readOrderFilters(params);

    expect(filters.deliveryMethod).toEqual(["OTHER", "PICKUP"]);
    expect(filters.pickupPointId).toBe(POINT);

    const url = orderFiltersToUrl(filters);
    // Written in the settings' order, so one selection is one URL.
    expect(url.deliveryMethod).toBe("PICKUP,OTHER");
    expect(url.pickupPointId).toBe(POINT);

    const back = readOrderFilters(
      new URLSearchParams(
        Object.entries(url).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
    );
    expect(back).toEqual({ ...filters, deliveryMethod: ["PICKUP", "OTHER"] });
  });

  it("drops both params from the URL when they are cleared", () => {
    const url = orderFiltersToUrl(EMPTY_FILTERS);
    expect(url).toHaveProperty("deliveryMethod", undefined);
    expect(url).toHaveProperty("pickupPointId", undefined);
  });

  it("sends them to the API as the list's CSV and id", () => {
    expect(
      orderFiltersToQuery(
        {
          ...EMPTY_FILTERS,
          deliveryMethod: ["COURIER", "NOVA_POSHTA"],
          pickupPointId: POINT,
        },
        "",
      ),
    ).toMatchObject({
      deliveryMethod: "NOVA_POSHTA,COURIER",
      pickupPointId: POINT,
    });
  });

  it("names the methods in one chip, and the point by name when it is known", () => {
    const chips = orderFilterChips(
      {
        ...EMPTY_FILTERS,
        deliveryMethod: ["OTHER", "COURIER"],
        pickupPointId: POINT,
      },
      { [POINT]: "Магазин на Хрещатику" },
    );

    expect(chips.map((chip) => chip.label)).toEqual([
      "Доставка: Курʼєр по місту, Інша доставка",
      "Точка: Магазин на Хрещатику",
    ]);
    expect(chips[0].clear).toEqual({ deliveryMethod: undefined });
    expect(chips[1].clear).toEqual({ pickupPointId: undefined });
  });

  it("says «Точка самовивозу» when the point's name is not known", () => {
    const [chip] = orderFilterChips({ ...EMPTY_FILTERS, pickupPointId: POINT });
    expect(chip.label).toBe("Точка самовивозу");
  });

  it("counts as a non-status filter for the empty state", () => {
    expect(
      hasNonStatusFilters({ ...EMPTY_FILTERS, deliveryMethod: ["PICKUP"] }),
    ).toBe(true);
    expect(
      hasNonStatusFilters({ ...EMPTY_FILTERS, pickupPointId: POINT }),
    ).toBe(true);
  });
});
