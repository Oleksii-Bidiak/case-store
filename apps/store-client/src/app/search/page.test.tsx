import { render, screen, within } from "@/shared/test/render";
import { dict, H1_CLASS, PAGE_CONTAINER } from "@/shared/config";
import SearchPage from "./page";

// The results widget is a client component with its own suite; here only the
// server-rendered shell around it matters.
jest.mock("@/widgets", () => ({
  SearchResultsView: () => <div data-testid="search-results" />,
}));

// No legacy uuid params in these URLs, so no 308 — and no request either.
jest.mock("@/shared/lib/legacy-catalog-params", () => ({
  resolveLegacyCatalogParams: jest.fn(async () => null),
  withQuery: (path: string) => path,
}));

async function renderPage(params: Record<string, string>) {
  const ui = await SearchPage({ searchParams: Promise.resolve(params) });
  return render(ui);
}

/**
 * TASK-876 — `/search` wears the catalogue's shell: the same container
 * padding, a breadcrumb row and the title block spacing of `/products`, so the
 * chips row and the toolbar start at the same height on both pages.
 */
describe("/search page shell (TASK-876)", () => {
  it("renders breadcrumbs ending in the query, with the search hub linked", async () => {
    await renderPage({ q: "чохол" });

    const crumbs = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    expect(
      within(crumbs).getByRole("link", { name: dict.catalog.breadcrumbHome }),
    ).toHaveAttribute("href", "/");
    expect(
      within(crumbs).getByRole("link", { name: dict.search.resultsTitleEmpty }),
    ).toHaveAttribute("href", "/search");
    expect(within(crumbs).getByText("«чохол»")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("ends the trail on «Пошук товарів» (not a link) when there is no query", async () => {
    await renderPage({});

    const crumbs = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    expect(within(crumbs).getAllByRole("link")).toHaveLength(1);
    expect(
      within(crumbs).getByText(dict.search.resultsTitleEmpty),
    ).toHaveAttribute("aria-current", "page");
  });

  it("uses the catalogue's container padding and title spacing", async () => {
    const { container } = await renderPage({ q: "чохол" });

    const shell = container.firstElementChild;
    expect(shell?.className).toBe(`${PAGE_CONTAINER} py-6 sm:py-8`);

    const h1 = screen.getByRole("heading", {
      level: 1,
      name: dict.search.resultsTitle("чохол"),
    });
    expect(h1.className).toBe(`${H1_CLASS} text-foreground`);
    expect(h1.parentElement).toHaveClass("mb-4.5");
    expect(screen.getByTestId("search-results")).toBeInTheDocument();
  });
});
