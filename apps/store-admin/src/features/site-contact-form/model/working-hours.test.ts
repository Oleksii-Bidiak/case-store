import {
  DEFAULT_WORKING_HOURS_MODEL,
  getDayIssue,
  isAllClosed,
  isModelValid,
  parseWorkingHours,
  serializeWorkingHours,
  type WorkingHoursModel,
} from "./working-hours";

const hours = (open: string, close: string) => ({ open, close });

const WEEKDAYS_9_18: WorkingHoursModel = [
  hours("09:00", "18:00"),
  hours("09:00", "18:00"),
  hours("09:00", "18:00"),
  hours("09:00", "18:00"),
  hours("09:00", "18:00"),
  hours("10:00", "16:00"),
  null,
];

const ALL_CLOSED: WorkingHoursModel = [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

const ALTERNATING: WorkingHoursModel = [
  hours("09:00", "18:00"),
  null,
  hours("09:00", "18:00"),
  null,
  hours("09:00", "18:00"),
  null,
  hours("09:00", "18:00"),
];

describe("serializeWorkingHours (TASK-221)", () => {
  it("groups consecutive days with identical hours", () => {
    expect(serializeWorkingHours(WEEKDAYS_9_18)).toBe(
      "Пн–Пт: 9:00–18:00; Сб: 10:00–16:00; Нд: вихідний",
    );
  });

  it("collapses all seven identical days into one range", () => {
    const allSame: WorkingHoursModel = new Array(7).fill(
      hours("09:00", "18:00"),
    );
    expect(serializeWorkingHours(allSame)).toBe("Пн–Нд: 9:00–18:00");
  });

  it("serializes an all-closed week", () => {
    expect(serializeWorkingHours(ALL_CLOSED)).toBe("Пн–Нд: вихідний");
  });

  it("keeps alternating days as single-day segments", () => {
    expect(serializeWorkingHours(ALTERNATING)).toBe(
      "Пн: 9:00–18:00; Вт: вихідний; Ср: 9:00–18:00; Чт: вихідний; " +
        "Пт: 9:00–18:00; Сб: вихідний; Нд: 9:00–18:00",
    );
  });

  it("splits a group on a single differing day in the middle", () => {
    const model: WorkingHoursModel = [
      hours("09:00", "18:00"),
      hours("09:00", "18:00"),
      hours("11:00", "15:00"),
      hours("09:00", "18:00"),
      hours("09:00", "18:00"),
      null,
      null,
    ];
    expect(serializeWorkingHours(model)).toBe(
      "Пн–Вт: 9:00–18:00; Ср: 11:00–15:00; Чт–Пт: 9:00–18:00; Сб–Нд: вихідний",
    );
  });

  it("strips the leading zero from hours but keeps minutes padded", () => {
    const model: WorkingHoursModel = new Array(7).fill(hours("09:05", "18:30"));
    expect(serializeWorkingHours(model)).toBe("Пн–Нд: 9:05–18:30");
  });
});

describe("parseWorkingHours (TASK-221)", () => {
  it("parses the canonical format back into a zero-padded model", () => {
    expect(
      parseWorkingHours("Пн–Пт: 9:00–18:00; Сб: 10:00–16:00; Нд: вихідний"),
    ).toEqual(WEEKDAYS_9_18);
  });

  it("round-trips every representative model", () => {
    for (const model of [
      WEEKDAYS_9_18,
      ALL_CLOSED,
      ALTERNATING,
      DEFAULT_WORKING_HOURS_MODEL,
    ]) {
      expect(parseWorkingHours(serializeWorkingHours(model))).toEqual(model);
    }
  });

  it("accepts hyphen and em dash instead of en dash", () => {
    expect(parseWorkingHours("Пн-Пт: 9:00-18:00; Сб-Нд: вихідний")).toEqual([
      ...DEFAULT_WORKING_HOURS_MODEL,
    ]);
    expect(parseWorkingHours("Пн—Пт: 9:00—18:00; Сб—Нд: вихідний")).toEqual([
      ...DEFAULT_WORKING_HOURS_MODEL,
    ]);
  });

  it("accepts comma separators, spaces around the time dash and zero-padded hours", () => {
    expect(parseWorkingHours("Пн–Пт: 09:00 – 18:00, Сб–Нд: вихідний")).toEqual(
      DEFAULT_WORKING_HOURS_MODEL,
    );
  });

  it("accepts «Вихідний» and day names case-insensitively", () => {
    expect(parseWorkingHours("пн–пт: 9:00–18:00; СБ–НД: ВИХІДНИЙ")).toEqual(
      DEFAULT_WORKING_HOURS_MODEL,
    );
  });

  it("parses the long-standing admin placeholder example", () => {
    expect(parseWorkingHours("Пн–Нд: 9:00 – 20:00")).toEqual(
      new Array(7).fill(hours("09:00", "20:00")),
    );
  });

  it("returns null for legacy free text", () => {
    expect(parseWorkingHours("Цілодобово, без вихідних")).toBeNull();
    expect(parseWorkingHours("Будні з 9 до 18, субота до обіду")).toBeNull();
    expect(parseWorkingHours("")).toBeNull();
    expect(parseWorkingHours("   ")).toBeNull();
  });

  it("returns null when some days are not covered", () => {
    expect(parseWorkingHours("Пн–Пт: 9:00–18:00")).toBeNull();
  });

  it("returns null when a day is covered twice", () => {
    expect(parseWorkingHours("Пн–Пт: 9:00–18:00; Пт–Нд: вихідний")).toBeNull();
  });

  it("returns null for wrapped day ranges", () => {
    expect(parseWorkingHours("Сб–Пн: вихідний; Вт–Пт: 9:00–18:00")).toBeNull();
  });

  it("returns null for out-of-range times", () => {
    expect(parseWorkingHours("Пн–Нд: 25:00–26:00")).toBeNull();
    expect(parseWorkingHours("Пн–Нд: 9:70–18:00")).toBeNull();
  });
});

describe("working-hours validation helpers (TASK-221)", () => {
  it("flags empty time fields as missing", () => {
    expect(getDayIssue(hours("", "18:00"))).toBe("missing");
    expect(getDayIssue(hours("09:00", ""))).toBe("missing");
  });

  it("flags close ≤ open as an ordering issue", () => {
    expect(getDayIssue(hours("18:00", "09:00"))).toBe("order");
    expect(getDayIssue(hours("09:00", "09:00"))).toBe("order");
  });

  it("accepts вихідний and valid intervals", () => {
    expect(getDayIssue(null)).toBeNull();
    expect(getDayIssue(hours("09:00", "18:00"))).toBeNull();
  });

  it("isModelValid reflects per-day issues", () => {
    expect(isModelValid(WEEKDAYS_9_18)).toBe(true);
    expect(
      isModelValid([hours("18:00", "09:00"), ...WEEKDAYS_9_18.slice(1)]),
    ).toBe(false);
  });

  it("isAllClosed only matches a fully closed week", () => {
    expect(isAllClosed(ALL_CLOSED)).toBe(true);
    expect(isAllClosed(WEEKDAYS_9_18)).toBe(false);
  });
});
