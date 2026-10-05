// The route imports the widgets barrel (heavy client tree); stub it the same
// way `page.test.ts` does. The assertion is about WHICH skeleton this route
// falls back to, not about the skeleton's markup.
jest.mock("@/widgets", () => ({
  ProductDetailSkeleton: () => <div data-testid="product-detail-skeleton" />,
  ProductListSkeleton: () => <div data-testid="product-list-skeleton" />,
}));

import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@/shared/test/render";
import Loading from "./loading";

describe("products/[slug] loading boundary (TASK-409)", () => {
  it("falls back to the product-detail skeleton, not the catalogue grid", () => {
    render(<Loading />);

    expect(screen.getByTestId("product-detail-skeleton")).toBeInTheDocument();
    expect(
      screen.queryByTestId("product-list-skeleton"),
    ).not.toBeInTheDocument();
  });

  // TASK-832 — Next prefetches a dynamic route only "layout to first loading
  // boundary". Any loading.* on the URL path ABOVE this segment becomes the
  // shell cached for every product link, and the shopper sees it instead of
  // this skeleton. The catalogue's boundary lives in `products/(catalog)`.
  it("has no ancestor loading boundary on the /products/[slug] path", () => {
    const appDir = path.resolve(__dirname, "..", "..");
    const ancestors = [appDir, path.join(appDir, "products")];
    const boundaries = ancestors.flatMap((dir) =>
      ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"]
        .map((file) => path.join(dir, file))
        .filter((file) => fs.existsSync(file)),
    );

    expect(boundaries).toEqual([]);
    // The catalogue keeps its own skeleton, scoped to the listing.
    expect(
      fs.existsSync(path.join(appDir, "products", "(catalog)", "loading.tsx")),
    ).toBe(true);
  });
});
