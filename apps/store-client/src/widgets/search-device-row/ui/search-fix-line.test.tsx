import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { DeviceModelListItemEntity } from "@/entities/device";
import { SearchFixLine } from "./search-fix-line";

let currentQuery = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

function model(id: string, name: string): DeviceModelListItemEntity {
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
  };
}

const MODELS = [
  model("iphone-15-pro", "iPhone 15 Pro"),
  model("iphone-15-pro-max", "iPhone 15 Pro Max"),
];

let modelRequests = 0;

beforeEach(() => {
  modelRequests = 0;
  server.use(
    http.get("*/api/device-models", () => {
      modelRequests += 1;
      return HttpResponse.json({ data: MODELS });
    }),
  );
});

function renderLine(q: string, extra = "") {
  currentQuery = `q=${encodeURIComponent(q)}${extra}`;
  return renderWithProviders(<SearchFixLine query={q} />);
}

const exactLink = (q: string) =>
  screen.findByRole("link", { name: dict.searchDevice.fix.exact(q) });

describe("SearchFixLine — «Шукаємо як …» (TASK-2069, Д3-2 §3.2)", () => {
  it("a Cyrillic query → the model it was read as, and the exact way out", async () => {
    renderLine("iphone 15 про", "&category=cases&page=2&sort=price_asc");

    const link = await exactLink("iphone 15 про");
    expect(screen.getByText("iPhone 15 Pro")).toBeInTheDocument();
    const params = new URLSearchParams(
      link.getAttribute("href")!.split("?")[1],
    );
    expect(params.get("q")).toBe("iphone 15 про");
    expect(params.get("exact")).toBe("1");
    // The category filter is reset, the sort kept.
    expect(params.get("category")).toBeNull();
    expect(params.get("page")).toBeNull();
    expect(params.get("sort")).toBe("price_asc");
  });

  it("an accessory word → «чохли для iPhone 15 Pro»", async () => {
    renderLine("чохол айфон 15 про");

    await exactLink("чохол айфон 15 про");
    expect(
      screen.getByText(
        dict.searchDevice.fix.productFor("Чохли", "iPhone 15 Pro"),
      ),
    ).toBeInTheDocument();
    expect(dict.searchDevice.fix.productFor("Чохли", "iPhone 15 Pro")).toBe(
      "чохли для iPhone 15 Pro",
    );
  });

  it("a query typed exactly → no line", async () => {
    const { container } = renderLine("iphone 15 pro");

    await waitFor(() => expect(modelRequests).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("exact mode → no line, and no model lookup", async () => {
    const { container } = renderLine("iphone 15 про", "&exact=1");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(modelRequests).toBe(0);
  });
});
