import { dict } from "@/shared/config";
import { productSaveErrorMessage } from "./save-error";

/** The shape axios rejects with, as far as the error helpers read it. */
function apiError(status: number, data: Record<string, unknown>) {
  return { response: { status, data } };
}

describe("productSaveErrorMessage", () => {
  it("words a 409 PRODUCT_CATEGORY_BUSY itself — a retry, nothing written", () => {
    expect(
      productSaveErrorMessage(
        apiError(409, {
          error: "PRODUCT_CATEGORY_BUSY",
          message:
            "Categories are being changed right now — try again in a moment",
          statusCode: 409,
        }),
      ),
    ).toBe(dict.productForm.errorCategoryBusy);
  });

  it("words a 400 PRODUCT_CATEGORY_GONE itself — pick another category", () => {
    expect(
      productSaveErrorMessage(
        apiError(400, {
          error: "PRODUCT_CATEGORY_GONE",
          message: "Category not found",
          statusCode: 400,
        }),
      ),
    ).toBe(dict.productForm.errorCategoryGone);
  });

  it("keeps the server's own words for any other refusal (TASK-397)", () => {
    expect(
      productSaveErrorMessage(
        apiError(409, {
          error: "Conflict",
          message: "A product with this SKU already exists",
          statusCode: 409,
        }),
      ),
    ).toBe("A product with this SKU already exists");
  });

  it("does not take the code alone as proof — the status decides", () => {
    expect(
      productSaveErrorMessage(
        apiError(500, { error: "PRODUCT_CATEGORY_BUSY", message: "boom" }),
      ),
    ).toBe("boom");
  });

  it("is undefined when the server said nothing, so the caller falls back", () => {
    expect(productSaveErrorMessage(new Error("network"))).toBeUndefined();
  });
});
