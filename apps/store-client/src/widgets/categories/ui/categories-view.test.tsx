import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CategoriesView } from "./categories-view";

const tree = {
  data: [
    {
      id: "c1",
      name: "Смартфони",
      slug: "phones",
      isActive: true,
      sortOrder: 0,
      children: [
        {
          id: "c1a",
          name: "Чохли",
          slug: "cases",
          isActive: true,
          sortOrder: 0,
          children: [],
        },
      ],
    },
    {
      id: "c2",
      name: "Аудіо",
      slug: "audio",
      isActive: true,
      sortOrder: 1,
      children: [
        {
          id: "c2a",
          name: "Навушники",
          slug: "headphones",
          isActive: true,
          sortOrder: 0,
          children: [],
        },
      ],
    },
  ],
};

const brands = {
  data: [
    {
      id: "b1",
      name: "Spigen",
      slug: "spigen",
      logo: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("CategoriesView", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json(tree)),
      http.get("*/api/brands", () => HttpResponse.json(brands)),
    );
  });

  it("renders the rail and the first group's child tiles + real brand strip", async () => {
    renderWithProviders(<CategoriesView />);

    // Rail lists both root categories.
    expect(
      await screen.findByRole("button", { name: /Смартфони/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Аудіо/ })).toBeInTheDocument();

    // Default content = first root, with its child tile linking to the catalog.
    expect(
      screen.getByRole("heading", { level: 1, name: "Смартфони" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "href",
      "/categories/cases",
    );

    // Brands strip — real Brand data, linking to the brand-filtered catalog.
    expect(screen.getByText(dict.categories.brandsHeading)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Spigen" })).toHaveAttribute(
      "href",
      // TASK-420 — the catalogue is addressed by slug.
      "/products?brand=spigen",
    );
  });

  it("switches the content group when another rail item is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesView />);

    await user.click(await screen.findByRole("button", { name: /Аудіо/ }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Аудіо" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Навушники" })).toHaveAttribute(
      "href",
      "/categories/headphones",
    );
  });

  it("renders a child tile image when Category.image is set (TASK-083)", async () => {
    // Since TASK-289 the tile renders through next/image: only hosts in
    // `images.remotePatterns` are drawn (anything else takes the gradient
    // fallback), and `src` becomes the optimizer route. The store-api uploads
    // origin is the only entry that needs no operator config — and since
    // TASK-365 it is also what the seed writes into `Category.image`.
    const image =
      "http://localhost:3001/uploads/products/seed-0f1e2d3c4b5a6978.webp";
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json({
          data: [
            {
              ...tree.data[0],
              children: [{ ...tree.data[0].children[0], image }],
            },
          ],
        }),
      ),
    );
    renderWithProviders(<CategoriesView />);

    const tile = await screen.findByRole("link", { name: "Чохли" });
    const img = tile.querySelector("img");
    expect(img?.getAttribute("src")).toContain(encodeURIComponent(image));
  });
});

// TASK-877 — the BreadcrumbList is built from the same trail the page shows.
describe("CategoriesView breadcrumbs and root chips (TASK-877)", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json(tree)),
      http.get("*/api/brands", () => HttpResponse.json(brands)),
    );
  });

  function readBreadcrumbSchema(container: HTMLElement) {
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    const schema = JSON.parse(script?.textContent ?? "{}") as {
      itemListElement?: { name: string }[];
    };
    return (schema.itemListElement ?? []).map((entry) => entry.name);
  }

  function readVisibleCrumbs() {
    const trail = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    return Array.from(
      trail.querySelectorAll("a, span:not([aria-hidden])"),
      (node) => node.textContent,
    );
  }

  it("emits the visible trail — home and the selected root — as JSON-LD", async () => {
    const { container } = renderWithProviders(<CategoriesView />);
    await screen.findByRole("heading", { level: 1, name: "Смартфони" });

    expect(readVisibleCrumbs()).toEqual([
      dict.categories.breadcrumbHome,
      "Смартфони",
    ]);
    expect(readBreadcrumbSchema(container)).toEqual(readVisibleCrumbs());
    const trail = screen.getByRole("navigation", {
      name: dict.product.breadcrumbAria,
    });
    expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent(
      "Смартфони",
    );
  });

  it("keeps the JSON-LD in step when another root is picked", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CategoriesView />);

    await user.click(await screen.findByRole("button", { name: /Аудіо/ }));

    expect(readBreadcrumbSchema(container)).toEqual([
      dict.categories.breadcrumbHome,
      "Аудіо",
    ]);
    expect(readBreadcrumbSchema(container)).toEqual(readVisibleCrumbs());
  });

  it("marks only the selected root as current, in one set of buttons", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategoriesView />);

    const phones = await screen.findByRole("button", { name: /Смартфони/ });
    const audio = screen.getByRole("button", { name: /Аудіо/ });
    expect(phones).toHaveAttribute("aria-current", "true");
    expect(phones).toHaveClass("bg-primary", "text-primary-foreground");
    expect(audio).not.toHaveAttribute("aria-current");

    await user.click(audio);

    expect(audio).toHaveAttribute("aria-current", "true");
    expect(audio).toHaveClass("bg-primary");
    expect(phones).not.toHaveAttribute("aria-current");
    // Chips (below lg) and the rail (lg+) are the same buttons, not two copies.
    expect(screen.getAllByRole("button", { name: /Аудіо/ })).toHaveLength(1);
  });
});
