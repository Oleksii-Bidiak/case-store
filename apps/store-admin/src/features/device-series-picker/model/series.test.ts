import {
  groupBySeries,
  partialSeriesReminders,
  seriesState,
  shortModelName,
  summarize,
  toBulkSelection,
  toggleSeries,
  type PickerModel,
} from "./series";

const apple = { id: "b-apple", name: "Apple" };
const samsung = { id: "b-sam", name: "Samsung" };

const m = (
  id: string,
  name: string,
  series: string | null,
  releaseYear: number | null = null,
  deviceBrandId = apple.id,
): PickerModel => ({ id, name, series, releaseYear, deviceBrandId });

const MODELS: PickerModel[] = [
  m("13", "iPhone 13", "iPhone 13", 2021),
  m("15pm", "iPhone 15 Pro Max", "iPhone 15", 2023),
  m("15p", "iPhone 15 Pro", "iPhone 15", 2023),
  m("15pl", "iPhone 15 Plus", "iPhone 15", 2023),
  m("15", "iPhone 15", "iPhone 15", 2023),
  m("se", "iPhone SE", null),
  m("16", "iPhone 16", "iPhone 16", 2024),
  m("s24", "Galaxy S24", "Galaxy S24", 2024, samsung.id),
];

describe("groupBySeries", () => {
  it("orders brands as given, series newest first, unnamed last, models in API order", () => {
    const groups = groupBySeries(MODELS, [samsung, apple]);

    expect(groups.map((g) => g.brandName)).toEqual(["Samsung", "Apple"]);
    const appleSeries = groups[1].series;
    expect(appleSeries.map((s) => s.series)).toEqual([
      "iPhone 16",
      "iPhone 15",
      "iPhone 13",
      null,
    ]);
    expect(appleSeries[1].models.map((model) => model.id)).toEqual([
      "15pm",
      "15p",
      "15pl",
      "15",
    ]);
  });

  it("leaves out brands without models", () => {
    expect(
      groupBySeries(MODELS, [apple, samsung, { id: "x", name: "Xiaomi" }]),
    ).toHaveLength(2);
  });
});

describe("shortModelName", () => {
  it.each([
    ["iPhone 15 Pro Max", "iPhone 15", "15 Pro Max"],
    ["Galaxy S24 Ultra", "Galaxy S24", "S24 Ultra"],
    ["Redmi Note 13 Pro", "Redmi Note 13", "13 Pro"],
    ["Apple Watch Series 10 46 мм", "Apple Watch", "Series 10 46 мм"],
    ["Pixel 8", null, "Pixel 8"],
    ["Something else", "iPhone 15", "Something else"],
  ])("%s in %s → %s", (name, series, expected) => {
    expect(shortModelName({ name, series })).toBe(expected);
  });
});

describe("seriesState / toggleSeries", () => {
  const group = groupBySeries(MODELS, [apple]).flatMap((b) => b.series)[1];

  it("is none, some or all", () => {
    expect(seriesState(group, new Set()).state).toBe("none");
    expect(seriesState(group, new Set(["15"]))).toEqual({
      selected: 1,
      total: 4,
      state: "some",
    });
    expect(
      seriesState(group, new Set(["15", "15p", "15pl", "15pm"])).state,
    ).toBe("all");
  });

  it("ticks the whole series from none or some, clears it from all", () => {
    const some = new Set(["15", "16"]);
    const all = toggleSeries(group, some);
    expect([...all].sort()).toEqual(["15", "15p", "15pl", "15pm", "16"].sort());
    expect([...toggleSeries(group, all)]).toEqual(["16"]);
  });
});

describe("summarize", () => {
  it("names a whole series once and a partial one model by model", () => {
    const groups = groupBySeries(MODELS, [apple]);
    const parts = summarize(
      groups,
      new Set(["15", "15p", "15pl", "15pm", "13"]),
    );

    expect(parts).toEqual([
      expect.objectContaining({ series: "iPhone 15", whole: true, total: 4 }),
      expect.objectContaining({ series: "iPhone 13", whole: true, total: 1 }),
    ]);
    const partial = summarize(groups, new Set(["15pm", "15"]));
    expect(partial[0]).toMatchObject({
      whole: false,
      names: ["iPhone 15 Pro Max", "15"],
    });
  });
});

describe("partialSeriesReminders", () => {
  it("reminds about the one missing model of a series of 3+", () => {
    const groups = groupBySeries(MODELS, [apple]);
    expect(
      partialSeriesReminders(groups, new Set(["15", "15p", "15pl"])),
    ).toEqual([
      expect.objectContaining({
        series: "iPhone 15",
        missingModelName: "iPhone 15 Pro Max",
        selected: 3,
        total: 4,
      }),
    ]);
    // Two missing — a deliberate choice, no reminder.
    expect(partialSeriesReminders(groups, new Set(["15", "15p"]))).toEqual([]);
  });
});

describe("toBulkSelection", () => {
  it("sends a whole series by name and the rest by id", () => {
    const groups = groupBySeries(MODELS, [apple, samsung]);
    expect(
      toBulkSelection(
        groups,
        new Set(["15", "15p", "15pl", "15pm", "13", "se", "s24"]),
      ),
    ).toEqual({
      series: ["iPhone 15", "iPhone 13", "Galaxy S24"],
      deviceModelIds: ["se"],
    });
    expect(toBulkSelection(groups, new Set(["15p"]))).toEqual({
      series: [],
      deviceModelIds: ["15p"],
    });
  });

  it("never sends a series name two brands share", () => {
    const shared = [
      m("a", "Pad 6", "Pad", 2023, apple.id),
      m("b", "Pad 6", "Pad", 2023, samsung.id),
    ];
    const groups = groupBySeries(shared, [apple, samsung]);
    expect(toBulkSelection(groups, new Set(["a"]))).toEqual({
      series: [],
      deviceModelIds: ["a"],
    });
  });
});
