import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import type { ProductGroupEntity } from "@/entities/product";
import { addDevice, clearMyDevices, setLabel } from "@/entities/my-devices";
import { ProductSiblingNavigator } from "./product-sibling-navigator";

/**
 * Group with two axes (color, pack) and three positions:
 *   blue/single, blue/double, indigo/single — indigo/double is absent (a gap).
 */
function makeGroup(): ProductGroupEntity {
  const sibling = (
    id: string,
    slug: string,
    color: string,
    pack: string,
    order: number,
  ) => ({
    id,
    slug,
    name: `${color} ${pack}`,
    price: "9.99",
    attributes: { color, pack },
    stock: 5,
    isActive: true,
    positionOrder: order,
  });

  return {
    id: "g1",
    name: "Tempered Glass",
    axes: [
      { name: "color", sortOrder: 0 },
      { name: "pack", sortOrder: 1 },
    ],
    positions: [
      sibling("p1", "glass-blue-single", "blue", "single", 0),
      sibling("p2", "glass-blue-double", "blue", "double", 1),
      sibling("p3", "glass-indigo-single", "indigo", "single", 2),
    ],
  };
}

describe("ProductSiblingNavigator", () => {
  it("renders one strip per axis and marks the current value active", () => {
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "blue", pack: "single" }}
        currentSlug="glass-blue-single"
      />,
    );

    // The current position's values have nowhere to go — they stay buttons, and
    // they are the pressed ones.
    expect(screen.getByRole("button", { name: "blue" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "single" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // TASK-409 — a reachable value is a real link, so the browser and Next's route
  // prefetch can both do their job; a router.push() button allowed neither.
  it("renders a reachable value as a link to the sibling matching the other axes", () => {
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "blue", pack: "single" }}
        currentSlug="glass-blue-single"
      />,
    );

    // Switching pack single→double keeps color=blue → blue/double position.
    expect(screen.getByRole("link", { name: "double" })).toHaveAttribute(
      "href",
      "/products/glass-blue-double",
    );
    // Switching color blue→indigo keeps pack=single → indigo/single position.
    expect(screen.getByRole("link", { name: "indigo" })).toHaveAttribute(
      "href",
      "/products/glass-indigo-single",
    );
  });

  // TASK-409 — the reported defect ("варіанти вантажаться заново"): switching a
  // variant re-fetched the whole detail page from a skeleton. Hover warms the
  // sibling under the SAME query key the PDP reads, so the click is a swap.
  it("prefetches the sibling's detail query on hover, under the PDP's own query key", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    server.use(
      http.get("*/api/products/:slug", ({ params }) =>
        HttpResponse.json({
          data: { id: "p2", slug: params.slug, name: "blue double" },
          category: { id: "cat-1", name: "Cases", slug: "cases" },
          images: [],
        }),
      ),
    );

    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "blue", pack: "single" }}
        currentSlug="glass-blue-single"
      />,
      { queryClient },
    );

    // Nothing is warmed before the pointer arrives.
    expect(
      queryClient.getQueryState(["/api/products/glass-blue-double"]),
    ).toBeUndefined();

    await user.hover(screen.getByRole("link", { name: "double" }));

    await waitFor(() =>
      expect(
        queryClient.getQueryState(["/api/products/glass-blue-double"])?.data,
      ).toBeDefined(),
    );
  });

  it("disables a value with no resolvable sibling (data gap)", () => {
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "indigo", pack: "single" }}
        currentSlug="glass-indigo-single"
      />,
    );

    // indigo/double does not exist → "double" is a DISABLED button, never a link
    // (a link cannot be disabled — Enter would still navigate).
    expect(screen.getByRole("button", { name: "double" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "double" })).toBeNull();
  });

  it("renders the colour axis as round swatches with the colour text as accessible name (TASK-215)", () => {
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "blue", pack: "single" }}
        currentSlug="glass-blue-single"
      />,
    );

    // Current colour → real swatch: accessible name + tooltip stay the colour
    // TEXT while the visible face is the colour itself (no text content).
    const blue = screen.getByRole("button", { name: "blue" });
    expect(blue).toHaveAttribute("title", "blue");
    expect(blue).toHaveTextContent("");
    expect(blue.style.background).toBeTruthy();

    // Unknown colour ("indigo" is not in the map) still renders a swatch — the
    // neutral fallback, never a crash. It is reachable, so it is a link. (jsdom
    // cannot parse the gradient background value; the fallback itself is covered
    // by the colorSwatch unit tests.)
    const indigo = screen.getByRole("link", { name: "indigo" });
    expect(indigo).toHaveAttribute("title", "indigo");
    expect(indigo).toHaveTextContent("");
    expect(indigo).toHaveAttribute("href", "/products/glass-indigo-single");

    // The non-colour axis keeps its text chips.
    expect(screen.getByRole("link", { name: "double" })).toHaveTextContent(
      "double",
    );
  });

  describe("the model axis (Product mockup §6.6)", () => {
    const sibling = (
      slug: string,
      model: string,
      color: string,
      order: number,
    ) => ({
      id: slug,
      slug,
      name: slug,
      price: "999",
      attributes: { Колір: color, Модель: model },
      stock: 1,
      isActive: true,
      positionOrder: order,
    });
    const group: ProductGroupEntity = {
      id: "g-m",
      name: "Clear Case",
      axes: [
        { name: "Колір", sortOrder: 0 },
        { name: "Модель", sortOrder: 1 },
      ],
      positions: [
        sibling("case-15pro-black", "iPhone 15 Pro", "Чорний", 0),
        sibling("case-13-blue", "iPhone 13", "Синій", 1),
      ],
    };
    const iphone13 = {
      modelId: "m-13",
      slug: "iphone-13",
      name: "iPhone 13",
      brandName: "Apple",
      family: "iphone" as const,
    };

    beforeEach(() => {
      window.localStorage.clear();
      clearMyDevices();
    });

    function renderModelGroup() {
      return renderWithProviders(
        <ProductSiblingNavigator
          group={group}
          currentAttributes={{ Колір: "Чорний", Модель: "iPhone 15 Pro" }}
          currentSlug="case-15pro-black"
        />,
      );
    }

    it("leads with the model chips, without the «iPhone » prefix", () => {
      const { container } = renderModelGroup();
      const legends = container.querySelectorAll("legend");
      expect(legends[0]).toHaveTextContent("Модель: iPhone 15 Pro");
      const current = screen.getByRole("button", { name: "iPhone 15 Pro" });
      expect(current).toHaveTextContent(/^15 Pro$/);
      expect(current).toHaveClass("rounded-full", "bg-primary");
    });

    it("opens another model in its own colour when the current one is missing", () => {
      renderModelGroup();
      expect(screen.getByRole("link", { name: "iPhone 13" })).toHaveAttribute(
        "href",
        "/products/case-13-blue",
      );
    });

    it("tags a saved device's chip with «ваш», or with its label", () => {
      addDevice(iphone13);
      const { unmount } = renderModelGroup();
      expect(
        screen.getByRole("link", { name: "iPhone 13 · ваш" }),
      ).toHaveTextContent("13ваш");
      unmount();
      setLabel("m-13", "Мама");
      renderModelGroup();
      expect(
        screen.getByRole("link", { name: "iPhone 13 · Мама" }),
      ).toBeInTheDocument();
    });
  });
});
