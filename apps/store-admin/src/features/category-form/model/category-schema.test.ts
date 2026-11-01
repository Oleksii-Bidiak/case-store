import { dict } from "@/shared/config";
import { categoryFormValuesToDto, categorySchema } from "./category-schema";

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

describe("category form — OG image is http(s) only (TASK-573)", () => {
  const { ogImage } = categorySchema.shape;

  it("accepts blank and an https URL", () => {
    expect(ogImage.safeParse("").success).toBe(true);
    expect(ogImage.safeParse("https://cdn.example.com/og.jpg").success).toBe(
      true,
    );
  });

  it.each(["javascript:alert(1)", "data:image/png;base64,AAAA"])(
    "rejects %j with the hint under the field",
    (value) => {
      const result = ogImage.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        dict.seoFields.errors.ogImageUrl,
      );
    },
  );
});

describe("category form — icon (TASK-1956)", () => {
  const { icon } = categorySchema.shape;
  const base = { name: "Зарядні пристрої", icon: "" };

  it.each(["chargers", "power-banks", "", undefined])("accepts %j", (key) => {
    expect(icon.safeParse(key).success).toBe(true);
  });

  it.each(["rocket", "folder", "all"])(
    "rejects %j — not an assignable key",
    (key) => {
      const result = icon.safeParse(key);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        dict.categoryForm.icon.unknownKey,
      );
    },
  );

  // Soft for roots (approved plan): an icon-less root still saves.
  it("does not require an icon for a root", () => {
    expect(categorySchema.safeParse({ ...base, parentId: "" }).success).toBe(
      true,
    );
  });

  it("sends the key, clears with null on update and omits it on create", () => {
    const parsed = categorySchema.parse({ ...base, icon: "chargers" });
    expect(categoryFormValuesToDto(parsed).icon).toBe("chargers");
    expect(categoryFormValuesToDto(parsed, { isUpdate: true }).icon).toBe(
      "chargers",
    );

    const empty = categorySchema.parse(base);
    expect(categoryFormValuesToDto(empty).icon).toBeUndefined();
    expect(categoryFormValuesToDto(empty, { isUpdate: true }).icon).toBeNull();
  });
});
