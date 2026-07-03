import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { NotFoundView } from "./not-found-view";

const d = dict.notFound;

describe("NotFoundView", () => {
  it("renders the 404 code and heading", () => {
    renderWithProviders(<NotFoundView />);

    expect(screen.getByText(d.code)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: d.heading }),
    ).toBeInTheDocument();
  });

  it("submits the search box to the real /search results page via GET", () => {
    renderWithProviders(<NotFoundView />);

    const input = screen.getByRole("textbox", { name: d.searchPlaceholder });
    const form = input.closest("form");
    expect(input).toHaveAttribute("name", "q");
    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
  });

  it("links home and to the catalog", () => {
    renderWithProviders(<NotFoundView />);

    expect(screen.getByRole("link", { name: d.home })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: d.catalog })).toHaveAttribute(
      "href",
      "/products",
    );
  });

  it("shows the popular-section shortcuts", () => {
    renderWithProviders(<NotFoundView />);

    expect(screen.getByText(d.popularHeading)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: d.popular.smartphones }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: d.popular.promo }),
    ).toBeInTheDocument();
  });
});
