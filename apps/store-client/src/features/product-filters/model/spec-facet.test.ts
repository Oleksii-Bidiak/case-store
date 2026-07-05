import { parseSpecParam, toSpecParam } from "./spec-facet";

describe("spec-facet helpers (TASK-191)", () => {
  describe("parseSpecParam", () => {
    it("parses a well-formed key:value pair", () => {
      expect(parseSpecParam("material:Силікон")).toEqual({
        key: "material",
        value: "Силікон",
      });
    });

    it("splits on the first colon only", () => {
      expect(parseSpecParam("ratio:16:9")).toEqual({
        key: "ratio",
        value: "16:9",
      });
    });

    it("returns undefined for malformed or missing input", () => {
      expect(parseSpecParam("material")).toBeUndefined();
      expect(parseSpecParam(":Силікон")).toBeUndefined();
      expect(parseSpecParam("material:")).toBeUndefined();
      expect(parseSpecParam(null)).toBeUndefined();
      expect(parseSpecParam(undefined)).toBeUndefined();
    });
  });

  describe("toSpecParam", () => {
    it("serializes a key/value into the param form", () => {
      expect(toSpecParam("material", "Силікон")).toBe("material:Силікон");
    });
  });
});
