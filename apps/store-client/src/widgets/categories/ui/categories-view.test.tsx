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
      "/products?brandId=b1",
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
