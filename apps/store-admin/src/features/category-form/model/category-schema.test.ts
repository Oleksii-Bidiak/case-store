import { categorySchema } from "./category-schema";

/**
 * TASK-808. `parentId` is an id the form read off the database (a legacy seed
 * id may carry no valid version nibble), so it is shape-checked only.
 */
const { parentId } = categorySchema.shape;

describe("category form — parentId is shape-checked (TASK-808)", () => {
  it.each([
    "aaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee",
    "3f2a9c10-1b2c-4d3e-7f40-123456789abc",
    "",
    undefined,
  ])("accepts %j", (id) => {
    expect(parentId.safeParse(id).success).toBe(true);
  });

  it.each(["not-a-uuid", "aaaaaaaa-bbbb-cccc-eeeeeeeeeeee"])(
    "rejects %j",
    (id) => {
      expect(parentId.safeParse(id).success).toBe(false);
    },
  );
});
