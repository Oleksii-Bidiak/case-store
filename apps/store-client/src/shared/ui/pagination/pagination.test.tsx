import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { Pagination } from "./pagination";

/** Hrefs are the caller's business — this one is trivially inspectable. */
const buildHref = (page: number) => `/products?page=${page}`;

function renderPagination(currentPage: number, totalPages: number) {
  return renderWithProviders(
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      buildHref={buildHref}
    />,
  );
}

/**
 * The page numbers rendered, in order. Read off the DOM rather than by role:
 * the ellipsis items are `aria-hidden` (they are decoration, not navigation),
 * so a `listitem` role query would not see them.
 */
function pageLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("nav li")).map(
    (item) => item.textContent?.trim() ?? "",
  );
}

describe("Pagination (shared, TASK-417)", () => {
  it("lists every page when there are few of them", () => {
    const { container } = renderPagination(2, 5);

    expect(pageLabels(container)).toEqual(["1", "2", "3", "4", "5"]);
    expect(screen.getByRole("link", { name: "3" })).toHaveAttribute(
      "href",
      "/products?page=3",
    );
  });

  it("marks the current page for screen readers", () => {
    renderPagination(3, 5);

    expect(screen.getByRole("link", { name: "3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "2" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("truncates a long range around the current page", () => {
    // The window is [1 … cur-1 cur cur+1 … last] — never a wall of 40 numbers.
    const { container } = renderPagination(20, 40);

    expect(pageLabels(container)).toEqual([
      "1",
      "…",
      "19",
      "20",
      "21",
      "…",
      "40",
    ]);
  });

  it("keeps the first and last page reachable from both ends of the range", () => {
    const first = renderPagination(1, 40);
    expect(pageLabels(first.container)).toEqual(["1", "2", "…", "40"]);

    const last = renderPagination(40, 40);
    expect(pageLabels(last.container)).toEqual(["1", "…", "39", "40"]);
  });

  it("links prev/next with rel hints so crawlers read the sequence", () => {
    renderPagination(3, 5);

    const prev = screen.getByRole("link", {
      name: dict.catalog.paginationPreviousAria,
    });
    const next = screen.getByRole("link", {
      name: dict.catalog.paginationNextAria,
    });
    expect(prev).toHaveAttribute("href", "/products?page=2");
    expect(prev).toHaveAttribute("rel", "prev");
    expect(next).toHaveAttribute("href", "/products?page=4");
    expect(next).toHaveAttribute("rel", "next");
  });

  it("renders the ends as inert, non-focusable arrows instead of dead links", () => {
    // A disabled arrow must not be a link at all — a keyboard user tabbing
    // through the control would otherwise land on a control that goes nowhere.
    renderPagination(1, 5);

    expect(
      screen.queryByRole("link", { name: dict.catalog.paginationPreviousAria }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.catalog.paginationNextAria }),
    ).toBeInTheDocument();
  });

  it("accepts an explicit label for a page that paginates two things", () => {
    renderWithProviders(
      <Pagination
        currentPage={1}
        totalPages={3}
        buildHref={buildHref}
        ariaLabel="Навігація статтями"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Навігація статтями" }),
    ).toBeInTheDocument();
  });
});
