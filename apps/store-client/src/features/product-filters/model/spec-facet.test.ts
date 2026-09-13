import {
  parseSpecParam,
  toSpecParam,
  selectedSpecValues,
  toggleSpecValue,
  removeSpecValue,
} from "./spec-facet";

describe("spec-facet helpers (TASK-191, multi-value since TASK-414)", () => {
  describe("parseSpecParam", () => {
    it("parses the legacy single key:value pair", () => {
      expect(parseSpecParam("material:Силікон")).toEqual([
        { key: "material", values: ["Силікон"] },
      ]);
    });

    it("parses several values inside one facet", () => {
      expect(parseSpecParam("material:Силікон,TPU")).toEqual([
        { key: "material", values: ["Силікон", "TPU"] },
      ]);
    });

    it("parses several facets", () => {
      expect(parseSpecParam("material:Силікон,TPU;form:Накладка")).toEqual([
        { key: "material", values: ["Силікон", "TPU"] },
        { key: "form", values: ["Накладка"] },
      ]);
    });

    it("splits the key on the first colon only", () => {
      expect(parseSpecParam("ratio:16:9")).toEqual([
        { key: "ratio", values: ["16:9"] },
      ]);
    });

    it("trims whitespace and de-duplicates values", () => {
      expect(parseSpecParam(" material : TPU , TPU ")).toEqual([
        { key: "material", values: ["TPU"] },
      ]);
    });

    it("merges a repeated key instead of emitting it twice", () => {
      expect(parseSpecParam("material:Силікон;material:TPU")).toEqual([
        { key: "material", values: ["Силікон", "TPU"] },
      ]);
    });

    it("returns [] for malformed or missing input", () => {
      expect(parseSpecParam("material")).toEqual([]);
      expect(parseSpecParam(":Силікон")).toEqual([]);
      expect(parseSpecParam("material:")).toEqual([]);
      expect(parseSpecParam(null)).toEqual([]);
      expect(parseSpecParam(undefined)).toEqual([]);
    });

    it("skips a malformed chunk but keeps the well-formed ones", () => {
      expect(parseSpecParam("junk;material:TPU")).toEqual([
        { key: "material", values: ["TPU"] },
      ]);
    });
  });

  describe("toSpecParam", () => {
    it("serializes facets into the param form", () => {
      expect(
        toSpecParam([
          { key: "material", values: ["Силікон", "TPU"] },
          { key: "form", values: ["Накладка"] },
        ]),
      ).toBe("material:Силікон,TPU;form:Накладка");
    });

    it("is undefined when nothing is selected (so the param is removed)", () => {
      expect(toSpecParam([])).toBeUndefined();
      expect(toSpecParam([{ key: "material", values: [] }])).toBeUndefined();
    });

    it("round-trips through parseSpecParam", () => {
      const raw = "material:Силікон,TPU;form:Накладка";
      expect(toSpecParam(parseSpecParam(raw))).toBe(raw);
    });
  });

  describe("selectedSpecValues", () => {
    it("returns the values of one facet", () => {
      const facets = parseSpecParam("material:Силікон,TPU;form:Накладка");
      expect(selectedSpecValues(facets, "material")).toEqual([
        "Силікон",
        "TPU",
      ]);
    });

    it("returns [] for a facet with nothing selected", () => {
      expect(
        selectedSpecValues(parseSpecParam("material:TPU"), "form"),
      ).toEqual([]);
    });
  });

  describe("toggleSpecValue", () => {
    it("adds the first value of a facet", () => {
      expect(toggleSpecValue(undefined, "material", "TPU")).toBe(
        "material:TPU",
      );
    });

    it("accumulates values within a facet (OR)", () => {
      expect(toggleSpecValue("material:Силікон", "material", "TPU")).toBe(
        "material:Силікон,TPU",
      );
    });

    it("removes a value that was already selected", () => {
      expect(toggleSpecValue("material:Силікон,TPU", "material", "TPU")).toBe(
        "material:Силікон",
      );
    });

    it("drops the facet entirely once its last value is unticked", () => {
      expect(
        toggleSpecValue("material:TPU", "material", "TPU"),
      ).toBeUndefined();
    });

    // The regression this rework exists for: the old control rebuilt the whole
    // param from the facet being clicked, so a second facet wiped the first.
    it("KEEPS the other facets when a second facet is selected", () => {
      expect(toggleSpecValue("material:Силікон", "form", "Накладка")).toBe(
        "material:Силікон;form:Накладка",
      );
    });

    it("keeps the other facets when a value is unticked", () => {
      expect(
        toggleSpecValue(
          "material:Силікон,TPU;form:Накладка",
          "material",
          "TPU",
        ),
      ).toBe("material:Силікон;form:Накладка");
    });

    it("keeps the other facets when a facet empties out", () => {
      expect(
        toggleSpecValue("material:TPU;form:Накладка", "material", "TPU"),
      ).toBe("form:Накладка");
    });
  });

  describe("removeSpecValue", () => {
    it("removes just that value", () => {
      expect(
        removeSpecValue(
          "material:Силікон,TPU;form:Накладка",
          "material",
          "TPU",
        ),
      ).toBe("material:Силікон;form:Накладка");
    });

    // Removal must be idempotent: a stale chip clicked twice must not re-ADD the
    // value, which a bare `toggle` would do.
    it("is a no-op for a value that is not selected", () => {
      expect(removeSpecValue("material:Силікон", "material", "TPU")).toBe(
        "material:Силікон",
      );
      expect(removeSpecValue("material:Силікон", "form", "Накладка")).toBe(
        "material:Силікон",
      );
    });

    it("returns undefined when the last value goes", () => {
      expect(
        removeSpecValue("material:TPU", "material", "TPU"),
      ).toBeUndefined();
    });
  });
});
