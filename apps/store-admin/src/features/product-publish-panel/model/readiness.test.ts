import type { PublishBlocker } from "@/shared/api";
import {
  buildReadinessChecks,
  canPublish,
  missingSections,
  type ReadinessInput,
} from "./readiness";

/** A product that satisfies every advisory check — each test spoils one thing. */
const READY: ReadinessInput = {
  stock: 12,
  description: "<p>Протиударний чохол</p>",
  specCount: 4,
  compatCount: 2,
};

const check = (
  input: ReadinessInput,
  key: string,
  blockers: readonly PublishBlocker[] = [],
) => buildReadinessChecks(input, blockers).find((c) => c.key === key)!;

describe("buildReadinessChecks (TASK-361, TASK-2573)", () => {
  it("passes every check for a fully filled product the server calls ready", () => {
    expect(buildReadinessChecks(READY, []).every((c) => c.done)).toBe(true);
    expect(canPublish(buildReadinessChecks(READY, []))).toBe(true);
  });

  it("lists the four blocking checks first, in the server's order", () => {
    expect(
      buildReadinessChecks(READY, [])
        .filter((c) => c.blocking)
        .map((c) => c.key),
    ).toEqual(["name", "category", "price", "photo"]);
  });

  // The blocking half is the server's verdict, not a local rule: whatever the
  // API lists as a blocker is unmet, and nothing else is.
  describe("blocking checks follow the server's blockers", () => {
    it.each(["name", "category", "price", "photo"] as const)("%s", (key) => {
      expect(check(READY, key, [key]).done).toBe(false);
      expect(check(READY, key, [key]).blocking).toBe(true);
      expect(canPublish(buildReadinessChecks(READY, [key]))).toBe(false);
    });

    it("marks only the listed blockers unmet", () => {
      const checks = buildReadinessChecks(READY, ["price", "photo"]);
      expect(
        checks.filter((c) => c.blocking && !c.done).map((c) => c.key),
      ).toEqual(["price", "photo"]);
    });
  });

  describe("advisory checks warn but never block", () => {
    it.each([
      ["description", { description: null }],
      ["stock", { stock: 0 }],
      ["specs", { specCount: 0 }],
      ["compat", { compatCount: 0 }],
    ] as const)("%s", (key, overrides) => {
      const input = { ...READY, ...overrides };
      expect(check(input, key).done).toBe(false);
      expect(check(input, key).blocking).toBe(false);
      expect(canPublish(buildReadinessChecks(input, []))).toBe(true);
    });
  });

  // Tiptap serializes a cleared editor as "<p></p>", which is 7 characters of
  // nothing. A length check would call that a written description.
  it("does not count an empty rich-text document as a description", () => {
    expect(
      check({ ...READY, description: "<p></p>" }, "description").done,
    ).toBe(false);
    expect(
      check({ ...READY, description: "<p><br></p>" }, "description").done,
    ).toBe(false);
  });
});

describe("missingSections (wave 198, TASK-1050)", () => {
  it("is empty for a fully filled product", () => {
    expect(missingSections(buildReadinessChecks(READY, []))).toEqual([]);
  });

  it("names the form section each unmet check lives in, once", () => {
    const checks = buildReadinessChecks(
      { ...READY, stock: 0, compatCount: 0 },
      ["price", "photo"],
    );
    expect(missingSections(checks).sort()).toEqual(
      ["compat", "photos", "price"].sort(),
    );
  });

  it("puts name and category under «Основне», description and specs in their own", () => {
    const checks = buildReadinessChecks(
      { ...READY, description: "<p></p>", specCount: 0 },
      ["name", "category"],
    );
    expect(missingSections(checks).sort()).toEqual(
      ["description", "main", "specs"].sort(),
    );
  });
});
