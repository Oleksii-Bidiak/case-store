import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import { CatalogHead } from "./catalog-head";

describe("CatalogHead (Д3-2 Catalog §3)", () => {
  const trail = [
    { name: "Головна", href: "/" },
    { name: "Чохли", href: "/categories/cases" },
    { name: "Чохли для iPhone" },
  ];

  it("shows the crumbs from md and marks the last one current", () => {
    render(
      <CatalogHead
        trail={trail}
        back={{ label: "Чохли", href: "/categories/cases" }}
        title="Чохли для iPhone"
      />,
    );
    const nav = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    expect(nav).toHaveClass("hidden", "md:flex");
    expect(
      screen.getByText("Чохли для iPhone", { selector: "span" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("offers one back pill below md, a 44px target named for where it goes", () => {
    render(
      <CatalogHead
        trail={trail}
        back={{ label: "Чохли", href: "/categories/cases" }}
        title="Чохли для iPhone"
      />,
    );
    const back = screen.getByRole("link", {
      name: dict.catalog.backAria("Чохли"),
    });
    expect(back).toHaveAttribute("href", "/categories/cases");
    expect(back).toHaveClass("md:hidden", "h-11");
    expect(
      screen.getByRole("heading", { level: 1, name: "Чохли для iPhone" }),
    ).toBeInTheDocument();
  });
});
