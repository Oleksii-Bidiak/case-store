import { formatKeywords, parseKeywords } from "./keywords";

describe("parseKeywords (TASK-437)", () => {
  it("splits on commas and trims", () => {
    expect(parseKeywords("чохол, magsafe ,  ударостійкий")).toEqual([
      "чохол",
      "magsafe",
      "ударостійкий",
    ]);
  });

  it("also splits on newlines — a column pasted from a spreadsheet", () => {
    expect(parseKeywords("чохол\nmagsafe\n\nударостійкий")).toEqual([
      "чохол",
      "magsafe",
      "ударостійкий",
    ]);
  });

  it("drops blanks and case-insensitive duplicates, keeping the first spelling", () => {
    expect(parseKeywords("MagSafe, , magsafe,,MAGSAFE")).toEqual(["MagSafe"]);
  });

  it("treats an empty or missing value as no tags", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords("   ")).toEqual([]);
    expect(parseKeywords(undefined)).toEqual([]);
    expect(parseKeywords(null)).toEqual([]);
  });
});

describe("formatKeywords", () => {
  it("renders a stored list back into the input value", () => {
    expect(formatKeywords(["чохол", "magsafe"])).toBe("чохол, magsafe");
  });

  it("survives a missing list — the field is optional in the contract", () => {
    expect(formatKeywords(undefined)).toBe("");
    expect(formatKeywords(null)).toBe("");
    expect(formatKeywords([])).toBe("");
  });

  it("round-trips: parse(format(x)) === x", () => {
    const tags = ["чохол", "magsafe", "ударостійкий"];
    expect(parseKeywords(formatKeywords(tags))).toEqual(tags);
  });
});
