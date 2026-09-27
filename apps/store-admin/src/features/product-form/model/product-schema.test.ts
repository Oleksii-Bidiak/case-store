import { dict } from "@/shared/config";
import { productSchema } from "./product-schema";

/**
 * TASK-808 (the front half of TASK-397). The form posts back the category,
 * group and brand ids it read off the product, and the legacy seed wrote ids
 * whose version/variant nibbles belong to no UUID version. Every id field is a
 * SHAPE check, so the operator's own data never fails the form.
 */
const NON_V4_SHAPED = "aaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee";
const BAD_VARIANT = "3f2a9c10-1b2c-4d3e-7f40-123456789abc";

const { categoryId, groupId, brandId } = productSchema.shape;

describe("product form — id fields are shape-checked (TASK-808)", () => {
  it.each([NON_V4_SHAPED, BAD_VARIANT])(
    "accepts %s as categoryId, groupId and brandId",
    (id) => {
      expect(categoryId.safeParse(id).success).toBe(true);
      expect(groupId.safeParse(id).success).toBe(true);
      expect(brandId.safeParse(id).success).toBe(true);
    },
  );

  it.each(["", "not-a-uuid", "aaaaaaaa-bbbb-cccc-eeeeeeeeeeee"])(
    "still rejects %j as categoryId",
    (id) => {
      expect(categoryId.safeParse(id).success).toBe(false);
    },
  );
});

describe("product form — OG image is http(s) only (TASK-573)", () => {
  const { ogImage } = productSchema.shape;

  it.each([
    "",
    "https://cdn.example.com/og.jpg",
    "http://cdn.example.com/og.jpg",
  ])("accepts %j", (value) => {
    expect(ogImage.safeParse(value).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "data:image/png;base64,AAAA", "og.jpg"])(
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
