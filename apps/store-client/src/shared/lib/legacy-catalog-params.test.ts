jest.mock("@/shared/api/generated/brands/brands", () => ({
  brandControllerFindAll: jest.fn(),
}));
jest.mock("@/shared/api/generated/categories/categories", () => ({
  categoryControllerGetCategoryTree: jest.fn(),
}));
jest.mock("@/shared/api/generated/devices/devices", () => ({
  deviceControllerFindModels: jest.fn(),
}));

import { resolveLegacyCatalogParams, withQuery } from "./legacy-catalog-params";
import { brandControllerFindAll } from "@/shared/api/generated/brands/brands";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { deviceControllerFindModels } from "@/shared/api/generated/devices/devices";

const brands = brandControllerFindAll as jest.Mock;
const tree = categoryControllerGetCategoryTree as jest.Mock;
const models = deviceControllerFindModels as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  tree.mockResolvedValue({
    data: [
      {
        id: "cat-root",
        slug: "accessories",
        children: [{ id: "cat-leaf", slug: "phone-cases", children: [] }],
      },
    ],
  });
  brands.mockResolvedValue({ data: [{ id: "brand-1", slug: "apple" }] });
  models.mockResolvedValue({ data: [{ id: "model-1", slug: "iphone-15" }] });
});

describe("resolveLegacyCatalogParams (TASK-420)", () => {
  it("returns null — and makes no request — for a URL with no legacy param", async () => {
    await expect(
      resolveLegacyCatalogParams({ category: "phone-cases", page: "2" }),
    ).resolves.toBeNull();

    expect(tree).not.toHaveBeenCalled();
    expect(brands).not.toHaveBeenCalled();
    expect(models).not.toHaveBeenCalled();
  });

  it("rewrites all three uuid params to their slug form", async () => {
    const query = await resolveLegacyCatalogParams({
      categoryId: "cat-leaf",
      brandId: "brand-1",
      deviceModelId: "model-1",
    });

    const params = new URLSearchParams(query!);
    expect(params.get("category")).toBe("phone-cases");
    expect(params.get("brand")).toBe("apple");
    expect(params.get("device")).toBe("iphone-15");
  });

  it("resolves a nested category from anywhere in the tree", async () => {
    const query = await resolveLegacyCatalogParams({ categoryId: "cat-root" });

    expect(new URLSearchParams(query!).get("category")).toBe("accessories");
  });

  it("only looks up the axes the URL actually names", async () => {
    await resolveLegacyCatalogParams({ brandId: "brand-1" });

    expect(brands).toHaveBeenCalledTimes(1);
    expect(tree).not.toHaveBeenCalled();
    expect(models).not.toHaveBeenCalled();
  });

  it("carries every other param through untouched", async () => {
    const query = await resolveLegacyCatalogParams({
      brandId: "brand-1",
      minPrice: "100",
      specs: "material:Силікон",
      sortBy: "price",
    });

    const params = new URLSearchParams(query!);
    expect(params.get("minPrice")).toBe("100");
    expect(params.get("specs")).toBe("material:Силікон");
    expect(params.get("sortBy")).toBe("price");
  });

  it("keeps a repeated non-legacy param's every value", async () => {
    const query = await resolveLegacyCatalogParams({
      brandId: "brand-1",
      tag: ["a", "b"],
    });

    expect(new URLSearchParams(query!).getAll("tag")).toEqual(["a", "b"]);
  });

  // The loop guard, and the reason it matters: a redirect target that still
  // carried the legacy param would trigger this same redirect on arrival,
  // forever. A dead id cannot be spelled as a slug, so it is dropped.
  it("drops an unresolvable id rather than carrying it into the redirect", async () => {
    const query = await resolveLegacyCatalogParams({
      brandId: "no-such-brand",
      minPrice: "100",
    });

    const params = new URLSearchParams(query!);
    expect(params.has("brandId")).toBe(false);
    expect(params.has("brand")).toBe(false);
    expect(params.get("minPrice")).toBe("100");
  });

  it("drops the legacy param when the lookup itself fails", async () => {
    brands.mockRejectedValue(new Error("network down"));

    const query = await resolveLegacyCatalogParams({ brandId: "brand-1" });

    expect(new URLSearchParams(query!).has("brandId")).toBe(false);
  });

  it("never emits a legacy param, whatever it was handed", async () => {
    const query = await resolveLegacyCatalogParams({
      categoryId: "cat-leaf",
      brandId: "ghost",
      deviceModelId: "model-1",
    });

    const params = new URLSearchParams(query!);
    for (const legacy of ["categoryId", "brandId", "deviceModelId"]) {
      expect(params.has(legacy)).toBe(false);
    }
  });

  // On `/categories/[slug]` the route segment IS the category: rewriting the
  // legacy id to `?category=` could only agree redundantly or contradict.
  it("drops ?categoryId= outright in dropCategory mode", async () => {
    const query = await resolveLegacyCatalogParams(
      { categoryId: "cat-leaf", brandId: "brand-1" },
      { dropCategory: true },
    );

    const params = new URLSearchParams(query!);
    expect(params.has("category")).toBe(false);
    expect(params.get("brand")).toBe("apple");
    expect(tree).not.toHaveBeenCalled();
  });

  it("still redirects when the only legacy param is the dropped category", async () => {
    const query = await resolveLegacyCatalogParams(
      { categoryId: "cat-leaf", page: "2" },
      { dropCategory: true },
    );

    expect(query).not.toBeNull();
    expect(new URLSearchParams(query!).get("page")).toBe("2");
  });

  it("takes the first value when a legacy param is repeated", async () => {
    const query = await resolveLegacyCatalogParams({
      brandId: ["brand-1", "ghost"],
    });

    expect(new URLSearchParams(query!).get("brand")).toBe("apple");
  });
});

describe("withQuery", () => {
  it("appends a query string", () => {
    expect(withQuery("/products", "brand=apple")).toBe("/products?brand=apple");
  });

  it("omits the ? when nothing is left to ask", () => {
    expect(withQuery("/products", "")).toBe("/products");
  });
});
