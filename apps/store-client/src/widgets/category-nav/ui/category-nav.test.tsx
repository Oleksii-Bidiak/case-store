import { http, HttpResponse } from "msw";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { CategoryEntity } from "@/entities/category";
import { CategoryNav } from "./category-nav";

/** Build a root category with sensible defaults; override per-test. */
function makeCategory(overrides: Partial<CategoryEntity> = {}): CategoryEntity {
  return {
    id: "cat-1",
    name: "Чохли",
    slug: "cases",
    description: null,
    image: null,
    parentId: null,
    isActive: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setupHandlers(categories: CategoryEntity[] | "error") {
  server.use(
    http.get("*/api/categories", () =>
      categories === "error"
        ? HttpResponse.json(
            { error: "Internal", message: "boom", statusCode: 500 },
            { status: 500 },
          )
        : HttpResponse.json({ data: categories }),
    ),
  );
}

/** The tile image sits inside an aria-hidden slot — query the DOM directly. */
function tileImg(): HTMLImageElement | null {
  return document.querySelector("img");
}

describe("CategoryNav — tile images (TASK-083)", () => {
  it("renders the icon fallback (no <img>) when image is null", async () => {
    setupHandlers([makeCategory()]);
    renderWithProviders(<CategoryNav />);

    expect(await screen.findByRole("link", { name: /Чохли/ })).toHaveAttribute(
      "href",
      "/categories/cases",
    );
    expect(tileImg()).not.toBeInTheDocument();
  });

  it("renders the image when image is set", async () => {
    setupHandlers([
      makeCategory({ image: "https://cdn.example.com/cases.jpg" }),
    ]);
    renderWithProviders(<CategoryNav />);

    await screen.findByRole("link", { name: /Чохли/ });
    expect(tileImg()).toHaveAttribute(
      "src",
      "https://cdn.example.com/cases.jpg",
    );
  });

  it("falls back to the icon after the image fails to load", async () => {
    setupHandlers([
      makeCategory({ image: "https://cdn.example.com/broken.jpg" }),
    ]);
    renderWithProviders(<CategoryNav />);

    await screen.findByRole("link", { name: /Чохли/ });
    const img = tileImg();
    expect(img).toBeInTheDocument();
    fireEvent.error(img as HTMLImageElement);

    expect(tileImg()).not.toBeInTheDocument();
    // The link itself is untouched by the fallback swap.
    expect(screen.getByRole("link", { name: /Чохли/ })).toBeInTheDocument();
  });

  it("shows the error state when the request fails", async () => {
    setupHandlers("error");
    renderWithProviders(<CategoryNav />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.catalog.categoriesError,
    );
  });

  it("shows the empty state when there are no categories", async () => {
    setupHandlers([]);
    renderWithProviders(<CategoryNav />);

    expect(
      await screen.findByText(dict.catalog.noCategories),
    ).toBeInTheDocument();
  });
});
