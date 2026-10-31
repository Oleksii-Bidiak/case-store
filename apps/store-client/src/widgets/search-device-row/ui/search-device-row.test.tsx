import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { DeviceModelListItemEntity } from "@/entities/device";
import { SearchDeviceRow } from "./search-device-row";

let currentQuery = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

// The card and its action widgets have their own suites; here only WHICH
// devices are shown, and where, matters.
jest.mock("@/shared/ui", () => ({
  ...jest.requireActual("@/shared/ui"),
  ProductCard: ({ product }: { product: { name: string } }) => (
    <article data-testid="device-card">{product.name}</article>
  ),
}));
jest.mock("@/widgets/product-card-actions", () => ({
  ProductCardActions: () => null,
}));
jest.mock("@/widgets/product-quick-view", () => ({
  ProductQuickViewTrigger: () => null,
}));

function model(
  id: string,
  name: string,
  over: Partial<DeviceModelListItemEntity> = {},
): DeviceModelListItemEntity {
  return {
    id,
    deviceBrandId: "brand-apple",
    name,
    slug: id,
    series: null,
    releaseYear: null,
    brandName: "Apple",
    brandSlug: "apple",
    productCount: 10,
    ...over,
  };
}

const MODELS = [
  model("iphone-15-pro", "iPhone 15 Pro", { productCount: 128 }),
  model("iphone-15-pro-max", "iPhone 15 Pro Max", { productCount: 90 }),
  model("iphone-12-mini", "iPhone 12 mini", { productCount: 12 }),
];

const phone = (id: string, name: string, priceFrom: string) => ({
  id,
  name,
  slug: id,
  price: priceFrom,
  brand: { id: "b-apple", name: "Apple", slug: "apple" },
  variantSummary: { priceFrom },
});

/** What the device-category lookup returns: phones of every model. */
const PHONES = [
  phone("p-15-pro", "Смартфон Apple iPhone 15 Pro", "45999"),
  phone("p-15-pro-max", "Смартфон Apple iPhone 15 Pro Max", "52999"),
];

let lookups: URL[] = [];

beforeEach(() => {
  currentQuery = "";
  lookups = [];
  window.localStorage.clear();
  server.use(
    http.get("*/api/device-models", () => HttpResponse.json({ data: MODELS })),
    http.get("*/api/catalog/device-hubs/:slug", () =>
      HttpResponse.json({
        data: {
          model: {},
          productCount: 128,
          groups: [
            {
              category: {
                id: "c1",
                name: "Чохли",
                slug: "cases",
                icon: "cases",
              },
              productCount: 44,
              products: [],
            },
            {
              category: {
                id: "c2",
                name: "Захисне скло",
                slug: "screen-protectors",
                icon: null,
              },
              productCount: 23,
              products: [],
            },
          ],
        },
      }),
    ),
    http.get("*/api/search", ({ request }) => {
      const url = new URL(request.url);
      lookups.push(url);
      return HttpResponse.json({
        data: PHONES,
        meta: { total: PHONES.length, page: 1, limit: 24, totalPages: 1 },
      });
    }),
  );
});

function renderRow(q: string) {
  currentQuery = `q=${encodeURIComponent(q)}`;
  return renderWithProviders(<SearchDeviceRow query={q} />);
}

const row = () =>
  screen.findByRole("region", { name: dict.searchDevice.row.aria });
const saleHeading = (name: string, price: RegExp) =>
  screen.findByRole("heading", {
    level: 2,
    name: new RegExp(`^${name} у продажу · від ${price.source}`),
  });

/** True when `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("SearchDeviceRow — the /search model row (TASK-2069)", () => {
  // formatMoney groups with NBSPs — match any space.
  const PRICE = /45\s999\s₴/;

  it("bare model → the row, then «Сам … у продажу» under it", async () => {
    renderRow("айфон 15 про");

    const section = await row();
    expect(
      within(section).getByText(dict.searchDevice.row.kickerGuess),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("link", {
        name: dict.searchDevice.row.accessoriesFor("iPhone 15 Pro", "128"),
      }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");
    // The model's categories, with counts, to the compat landings.
    const casesPill = await within(section).findByRole("link", {
      name: /Чохли\s*44/,
    });
    expect(casesPill).toHaveAttribute("href", "/catalog/cases/iphone-15-pro");
    // TASK-1956: the sprite icon from `Category.icon`; none → the folder.
    expect(casesPill.querySelector("use")).toHaveAttribute(
      "href",
      "/icons/categories.svg#cat-cases",
    );
    expect(
      within(section)
        .getByRole("link", { name: /Захисне скло\s*23/ })
        .querySelector("use"),
    ).toHaveAttribute("href", "/icons/categories.svg#cat-folder");

    const heading = await saleHeading("iPhone 15 Pro", PRICE);
    expect(
      screen.getByText(dict.searchDevice.sale.kickerAfter.phone),
    ).toBeInTheDocument();
    expect(before(section, heading)).toBe(true);
    // Only the model's own device — not the Pro Max.
    expect(
      screen.getAllByTestId("device-card").map((c) => c.textContent),
    ).toEqual(["Смартфон Apple iPhone 15 Pro"]);
    // The lookup searched the device category by the model name.
    expect(lookups[0].searchParams.get("category")).toBe("smartphones");
    expect(lookups[0].searchParams.get("q")).toBe("iPhone 15 Pro");
  });

  it("device word + storage → the device block FIRST", async () => {
    renderRow("смартфон iphone 15 pro 256 гб");

    const heading = await saleHeading("iPhone 15 Pro", PRICE);
    expect(
      screen.getByText(dict.searchDevice.sale.kickerFirst),
    ).toBeInTheDocument();
    expect(before(heading, await row())).toBe(true);
  });

  it("accessory word → no device block, the main action goes to the landing", async () => {
    renderRow("чохол iphone 15 pro");

    const section = await row();
    expect(
      await within(section).findByRole("link", {
        name: dict.searchDevice.row.productFor("Чохли", "iPhone 15 Pro", "44"),
      }),
    ).toHaveAttribute("href", "/catalog/cases/iphone-15-pro");
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(lookups).toHaveLength(0);
  });

  it("device word, model not sold → the one «не продаємо» line", async () => {
    renderRow("iphone 12 mini купити");

    const section = await row();
    expect(
      await within(section).findByText(
        dict.searchDevice.row.notSold("iPhone 12 mini"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("device-card")).not.toBeInTheDocument();
  });

  it("bare model, not sold → neither block nor line", async () => {
    renderRow("iphone 12 mini");

    await row();
    await waitFor(() => expect(lookups).toHaveLength(1));
    expect(
      screen.queryByText(dict.searchDevice.row.notSold("iPhone 12 mini")),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-card")).not.toBeInTheDocument();
  });

  it("offers the other matching models as searches («Або можливо:»)", async () => {
    renderRow("iphone 15 pro");

    const section = await row();
    expect(
      within(section).getByRole("link", { name: "iPhone 15 Pro Max" }),
    ).toHaveAttribute("href", "/search?q=iPhone%2015%20Pro%20Max");
  });

  it("adds the model to «Мої пристрої» and turns into «Ваш пристрій»", async () => {
    const user = userEvent.setup();
    renderRow("iphone 15 pro");

    const section = await row();
    await user.click(
      within(section).getByRole("button", {
        name: dict.searchDevice.action.add,
      }),
    );
    expect(
      await within(section).findByText(dict.searchDevice.row.kickerActive),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(dict.searchDevice.action.mine),
    ).toHaveFocus();
  });

  it("«шукати точно» (?exact=1) → no row, no device block", async () => {
    currentQuery = `q=${encodeURIComponent("айфон 15 про")}&exact=1`;
    const { container } = renderWithProviders(
      <SearchDeviceRow query="айфон 15 про" />,
    );

    // Give the model list time to land — it must still recognise nothing.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(lookups).toHaveLength(0);
  });

  it("renders nothing for a query without a model", async () => {
    const { container } = renderRow("чохол");

    // The list arrives, and still nothing is recognised.
    await waitFor(() => expect(lookups).toHaveLength(0));
    expect(container).toBeEmptyDOMElement();
  });
});
