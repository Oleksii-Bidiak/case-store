// next/navigation is unavailable under jsdom, and since TASK-416 the open tab
// IS the URL — a mock that only records `replace` would freeze every tab on
// "description" and break the click-through tests. So this is a miniature
// router: `replace` rewrites the query string and notifies the subscribed
// `useSearchParams` callers, exactly like the real hook does on navigation.
const mockReplace = jest.fn();
const mockListeners = new Set<() => void>();
let mockSearch = "";

jest.mock("next/navigation", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: (url: string, options?: { scroll?: boolean }) => {
        mockReplace(url, options);
        const queryStart = url.indexOf("?");
        mockSearch = queryStart === -1 ? "" : url.slice(queryStart + 1);
        mockListeners.forEach((notify) => notify());
      },
    }),
    useSearchParams: () => {
      const [, force] = react.useReducer((n: number) => n + 1, 0);
      react.useEffect(() => {
        mockListeners.add(force);
        return () => {
          mockListeners.delete(force);
        };
      }, [force]);
      return new URLSearchParams(mockSearch);
    },
    usePathname: () => "/products/glass-blue-single",
  };
});

import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { ProductSpecEntity } from "@/entities/product";
import { ProductSpecsTabs, resolveTabParam } from "./product-specs-tabs";
import { ProductHighlights } from "./product-highlights";

beforeEach(() => {
  mockReplace.mockClear();
  mockListeners.clear();
  mockSearch = "";
});

const spec = (over: Partial<ProductSpecEntity>): ProductSpecEntity => ({
  key: "material",
  label: "Матеріал",
  type: "SELECT",
  unit: null,
  value: "Силікон",
  isFilterable: true,
  ...over,
});

describe("ProductSpecsTabs — specs tab (TASK-191)", () => {
  it("renders real key/value rows when the product has specs", async () => {
    renderWithProviders(
      <ProductSpecsTabs
        description="desc"
        productId="p1"
        specs={[
          spec({}),
          spec({
            key: "power",
            label: "Потужність",
            type: "NUMBER",
            unit: "W",
            value: "20",
          }),
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabSpecs }),
    );

    expect(await screen.findByText("Матеріал")).toBeInTheDocument();
    expect(screen.getByText("Силікон")).toBeInTheDocument();
    // NUMBER value appends its unit.
    expect(screen.getByText("20 W")).toBeInTheDocument();
  });

  it("falls back to the empty-state copy when there are no specs", async () => {
    renderWithProviders(
      <ProductSpecsTabs description="desc" productId="p1" specs={[]} />,
    );

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabSpecs }),
    );

    expect(
      await screen.findByText(dict.product.specsEmpty),
    ).toBeInTheDocument();
  });
});

describe("ProductSpecsTabs — description tab (TASK-361)", () => {
  it("renders a rich-text description as real markup, not literal tags", () => {
    renderWithProviders(
      <ProductSpecsTabs
        description="<p>Захист <strong>360°</strong></p><ul><li>Матовий</li></ul>"
        productId="p1"
        specs={[]}
      />,
    );

    // The tag text itself must never reach the shopper.
    expect(screen.queryByText(/<p>/)).toBeNull();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("360°").tagName).toBe("STRONG");
    expect(screen.getByText("Матовий").tagName).toBe("LI");
  });

  // Descriptions written before the rich-text switch are plain text whose only
  // structure is their line breaks — rendering them as HTML would collapse them
  // into one paragraph.
  it("keeps a legacy plain-text description in a pre-line block", () => {
    renderWithProviders(
      <ProductSpecsTabs
        description={"Перший рядок\nДругий рядок"}
        productId="p1"
        specs={[]}
      />,
    );

    const block = screen.getByText(/Перший рядок/);
    expect(block).toHaveClass("whitespace-pre-line");
    expect(block.querySelector("p")).toBeNull();
  });

  it("shows the empty-state copy when there is no description", () => {
    renderWithProviders(
      <ProductSpecsTabs description={null} productId="p1" specs={[]} />,
    );

    expect(screen.getByText(dict.product.specsEmpty)).toBeInTheDocument();
  });
});

/**
 * TASK-416 — the open tab lives in `?tab=`, so a shopper can link straight to
 * the specifications, the back button steps between tabs and a reload keeps the
 * panel that was open. The default tab is deliberately paramless: a clean
 * `/products/<slug>` must stay the canonical address of the description.
 */
describe("ProductSpecsTabs — URL-addressable tabs (TASK-416)", () => {
  const render = () =>
    renderWithProviders(
      <ProductSpecsTabs
        description="Опис товару"
        productId="p1"
        specs={[spec({})]}
      />,
    );

  it("opens the tab named in ?tab= on first render", async () => {
    mockSearch = "tab=specs";
    render();

    expect(
      screen.getByRole("tab", { name: dict.product.tabSpecs }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Матеріал")).toBeInTheDocument();
    // Rendering must not rewrite the URL it was given.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to the description tab for an unknown ?tab= value", () => {
    mockSearch = "tab=nonsense";
    render();

    expect(
      screen.getByRole("tab", { name: dict.product.tabDescription }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Опис товару")).toBeInTheDocument();
  });

  it("writes ?tab= on switch without scrolling the page", async () => {
    render();

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabDelivery }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/products/glass-blue-single?tab=delivery",
      { scroll: false },
    );
    expect(
      screen.getByRole("tab", { name: dict.product.tabDelivery }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("drops ?tab= again when the shopper returns to the first tab", async () => {
    mockSearch = "tab=delivery";
    render();

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabDescription }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/products/glass-blue-single", {
      scroll: false,
    });
  });

  it("keeps the other query params intact when switching tabs", async () => {
    mockSearch = "utm_source=telegram";
    render();

    await userEvent.click(
      screen.getByRole("tab", { name: dict.product.tabSpecs }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/products/glass-blue-single?utm_source=telegram&tab=specs",
      { scroll: false },
    );
  });

  it("resolves ?tab= values defensively", () => {
    expect(resolveTabParam(null)).toBe("description");
    expect(resolveTabParam("")).toBe("description");
    expect(resolveTabParam("REVIEWS")).toBe("description");
    expect(resolveTabParam("specs")).toBe("specs");
    expect(resolveTabParam("delivery")).toBe("delivery");
  });
});

describe("ProductHighlights (TASK-191)", () => {
  it("renders the highlights strip with BOOLEAN formatted as Так/Ні", () => {
    renderWithProviders(
      <ProductHighlights
        highlights={[
          spec({
            key: "wireless",
            label: "Бездротова",
            type: "BOOLEAN",
            value: "true",
          }),
        ]}
      />,
    );

    expect(screen.getByText(dict.product.highlightsTitle)).toBeInTheDocument();
    expect(screen.getByText("Бездротова")).toBeInTheDocument();
    expect(screen.getByText(dict.product.specBooleanYes)).toBeInTheDocument();
  });

  it("renders nothing when there are no highlights", () => {
    const { container } = renderWithProviders(
      <ProductHighlights highlights={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
