import {
  analyzePositions,
  attributeUsage,
  axisValues,
  priceRange,
  type GroupPosition,
} from "./group-positions";

const pos = (
  id: string,
  attributes: Record<string, string>,
  price = "100.00",
  isActive = true,
): GroupPosition => ({ id, attributes, price, isActive });

describe("group positions (wave 198, ProductGroupsProposal ГТ3–ГТ4)", () => {
  const axes = ["Пам'ять", "Колір"];

  it("finds a position with no value for an axis and a repeated combination", () => {
    const result = analyzePositions(axes, [
      pos("a", { "Пам'ять": "128 ГБ", Колір: "Чорний" }),
      pos("b", { "Пам'ять": "128 ГБ" }),
      pos("c", { "Пам'ять": "256 ГБ", Колір: "Чорний" }),
      pos("d", { "Пам'ять": "256 ГБ", Колір: " чорний " }),
    ]);

    expect(result.missing.get("b")).toEqual(["Колір"]);
    expect(result.missing.has("a")).toBe(false);
    // Case and padding do not make a different value for the shopper.
    expect([...result.duplicates].sort()).toEqual(["c", "d"]);
    // One missing value + one repeated pair = 2 problems, as the banner says.
    expect(result.problemCount).toBe(2);
  });

  it("reports nothing for a clean group or a group without axes", () => {
    expect(
      analyzePositions(axes, [
        pos("a", { "Пам'ять": "128 ГБ", Колір: "Чорний" }),
        pos("b", { "Пам'ять": "128 ГБ", Колір: "Білий" }),
      ]).problemCount,
    ).toBe(0);
    expect(
      analyzePositions([], [pos("a", {}), pos("b", {})]).problemCount,
    ).toBe(0);
  });

  it("collects an axis's values in first-seen order, without blanks or repeats", () => {
    expect(
      axisValues("Колір", [
        pos("a", { Колір: "Чорний" }),
        pos("b", { Колір: "Білий" }),
        pos("c", { Колір: "Чорний" }),
        pos("d", { Колір: "  " }),
        pos("e", {}),
      ]),
    ).toEqual(["Чорний", "Білий"]);
  });

  it("lists the characteristics the positions carry, most used first", () => {
    expect(
      attributeUsage([
        pos("a", { Колір: "Чорний", "Пам'ять": "128 ГБ" }),
        pos("b", { Колір: "Білий" }),
        pos("c", { Колір: "" }),
      ]),
    ).toEqual([
      { name: "Колір", count: 2 },
      { name: "Пам'ять", count: 1 },
    ]);
  });

  it("gives the price range of the positions", () => {
    expect(
      priceRange([
        pos("a", {}, "61999.00"),
        pos("b", {}, "52999.00"),
        pos("c", {}, "79999.00"),
      ]),
    ).toEqual({ min: 52999, max: 79999 });
    expect(priceRange([])).toBeNull();
  });
});
