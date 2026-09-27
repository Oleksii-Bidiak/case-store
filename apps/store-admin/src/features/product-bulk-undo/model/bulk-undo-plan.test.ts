import { buildBulkUndoPlan, countPlanIds } from "./bulk-undo-plan";

const rows = [
  { id: "a", isActive: true, groupId: "g1", attributes: { Колір: "Чорний" } },
  { id: "b", isActive: false, groupId: null, attributes: {} },
  {
    id: "c",
    isActive: false,
    groupId: "g1",
    attributes: { color: " Чорний " },
  },
];

describe("buildBulkUndoPlan (TASK-837)", () => {
  it("groups the selection by previous value, skipping rows that do not change", () => {
    expect(buildBulkUndoPlan("status", ["a", "b", "c"], rows, true)).toEqual({
      kind: "status",
      steps: [{ value: false, ids: ["b", "c"] }],
    });
  });

  it("keeps null as its own group for groups and colours", () => {
    expect(buildBulkUndoPlan("group", ["a", "b", "c"], rows, "g2")).toEqual({
      kind: "group",
      steps: [
        { value: "g1", ids: ["a", "c"] },
        { value: null, ids: ["b"] },
      ],
    });
    expect(buildBulkUndoPlan("color", ["a", "b", "c"], rows, "Білий")).toEqual({
      kind: "color",
      steps: [
        { value: "Чорний", ids: ["a", "c"] },
        { value: null, ids: ["b"] },
      ],
    });
  });

  it("compares colours trimmed, so re-applying the same colour offers nothing", () => {
    expect(buildBulkUndoPlan("color", ["a", "c"], rows, " Чорний")).toBeNull();
  });

  it("returns null when nothing would change", () => {
    expect(buildBulkUndoPlan("status", ["b", "c"], rows, false)).toBeNull();
  });

  it("skips ids that are not on the page instead of guessing", () => {
    const plan = buildBulkUndoPlan("status", ["a", "zzz"], rows, false);
    expect(plan).toEqual({
      kind: "status",
      steps: [{ value: true, ids: ["a"] }],
    });
    expect(countPlanIds(plan!)).toBe(1);
  });
});
