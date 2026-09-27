import {
  MAX_SPEC_FACETS,
  MAX_SPEC_PARAM_LENGTH,
  MAX_SPEC_VALUES_PER_FACET,
  canSelectSpecValue,
  parseSpecParam,
  toSpecParam,
  selectedSpecValues,
  toggleSpecValue,
  removeSpecValue,
  formatFacetValue,
  formatFacetChipLabel,
  type FacetDefinition,
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

  /**
   * TASK-540 — the same caps as the API's `parseSpecFilters` + the
   * `@MaxLength(600)` on the param, so the ticks never promise more than the
   * grid is filtered by.
   */
  describe("server caps (TASK-540)", () => {
    const values = (n: number, prefix = "v") =>
      Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
    const facets = (n: number) =>
      Array.from({ length: n }, (_, i) => `k${i + 1}:x`).join(";");

    it("mirrors the server's numbers", () => {
      expect(MAX_SPEC_FACETS).toBe(6);
      expect(MAX_SPEC_VALUES_PER_FACET).toBe(20);
      expect(MAX_SPEC_PARAM_LENGTH).toBe(600);
    });

    it("parseSpecParam keeps at most 20 values per facet, after de-duplication", () => {
      const raw = `material:v1,v1,${values(22).join(",")}`;
      expect(parseSpecParam(raw)).toEqual([
        { key: "material", values: values(20) },
      ]);
    });

    it("parseSpecParam keeps at most 6 facets — the ceiling counts new keys only", () => {
      const parsed = parseSpecParam(`${facets(7)};k1:y`);
      expect(parsed.map((facet) => facet.key)).toEqual([
        "k1",
        "k2",
        "k3",
        "k4",
        "k5",
        "k6",
      ]);
      // The repeated k1 merged even though the ceiling had been reached.
      expect(parsed[0].values).toEqual(["x", "y"]);
    });

    it("refuses a 21st value in a facet, and toggleSpecValue leaves the param alone", () => {
      const raw = `material:${values(20).join(",")}`;
      expect(canSelectSpecValue(raw, "material", "v21")).toBe(false);
      expect(toggleSpecValue(raw, "material", "v21")).toBe(raw);
    });

    it("refuses a 7th facet but still accepts a value in one of the six", () => {
      const raw = facets(6);
      expect(canSelectSpecValue(raw, "k7", "x")).toBe(false);
      expect(toggleSpecValue(raw, "k7", "x")).toBe(raw);
      expect(canSelectSpecValue(raw, "k1", "y")).toBe(true);
    });

    it("refuses a value that would push the param past 600 characters", () => {
      // 9 + 586 = 595 characters: «,TPU» still fits (599), «,Силікон» does not (603).
      const long = "Д".repeat(586);
      const raw = `material:${long}`;
      expect(canSelectSpecValue(raw, "material", "Силікон")).toBe(false);
      expect(canSelectSpecValue(raw, "material", "TPU")).toBe(true);
      // Exactly at the limit is still accepted by the server.
      const atLimit = `material:${"Д".repeat(600 - "material:".length)}`;
      expect(atLimit).toHaveLength(600);
      expect(canSelectSpecValue(undefined, "material", atLimit.slice(9))).toBe(
        true,
      );
    });

    it("always allows unticking, however full the selection", () => {
      const raw = `material:${values(20).join(",")}`;
      expect(canSelectSpecValue(raw, "material", "v5")).toBe(true);
      expect(toggleSpecValue(raw, "material", "v5")).toBe(
        `material:${values(20)
          .filter((value) => value !== "v5")
          .join(",")}`,
      );
    });
  });

  /**
   * Display of a facet VALUE (TASK-488). B-10 widened the facet set past plain
   * SELECTs, and the two new shapes both read wrong raw: a BOOLEAN stores
   * "true", and a SELECT with a unit stores a bare numeral.
   */
  describe("formatFacetValue", () => {
    const magsafe: FacetDefinition = {
      key: "magsafe",
      label: "Підтримка MagSafe",
      type: "BOOLEAN",
      unit: null,
    };
    const ports: FacetDefinition = {
      key: "ports",
      label: "Кількість портів",
      type: "SELECT",
      unit: "шт",
    };
    const material: FacetDefinition = {
      key: "material",
      label: "Матеріал",
      type: "SELECT",
      unit: null,
    };

    it("renders a BOOLEAN facet as «Так» / «Ні», never true/false", () => {
      expect(formatFacetValue("true", magsafe)).toBe("Так");
      expect(formatFacetValue("false", magsafe)).toBe("Ні");
    });

    it("appends the unit of a SELECT that has one", () => {
      expect(formatFacetValue("2", ports)).toBe("2 шт");
    });

    it("leaves a plain SELECT value alone", () => {
      expect(formatFacetValue("Силікон", material)).toBe("Силікон");
    });

    it("falls back to the raw value when the definition is unknown", () => {
      expect(formatFacetValue("Силікон")).toBe("Силікон");
    });
  });

  describe("formatFacetChipLabel", () => {
    const magsafe: FacetDefinition = {
      key: "magsafe",
      label: "MagSafe",
      type: "BOOLEAN",
      unit: null,
    };

    it("names the facet for a boolean chip — «Так» alone says nothing", () => {
      expect(formatFacetChipLabel("true", magsafe)).toBe("MagSafe: Так");
      expect(formatFacetChipLabel("false", magsafe)).toBe("MagSafe: Ні");
    });

    it("leaves a SELECT chip as the bare value, as it has always been", () => {
      expect(
        formatFacetChipLabel("Силікон", {
          key: "material",
          label: "Матеріал",
          type: "SELECT",
          unit: null,
        }),
      ).toBe("Силікон");
    });

    it("renders the raw value while the facet list is still loading", () => {
      expect(formatFacetChipLabel("Силікон")).toBe("Силікон");
    });
  });
});
