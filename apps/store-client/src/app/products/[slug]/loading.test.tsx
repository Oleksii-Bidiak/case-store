// The route imports the widgets barrel (heavy client tree); stub it the same
// way `page.test.ts` does. The assertion is about WHICH skeleton this route
// falls back to, not about the skeleton's markup.
jest.mock("@/widgets", () => ({
  ProductDetailSkeleton: () => <div data-testid="product-detail-skeleton" />,
  ProductListSkeleton: () => <div data-testid="product-list-skeleton" />,
}));

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
});
