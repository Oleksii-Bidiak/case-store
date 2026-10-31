import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { DeviceModelListItemEntity } from "@/entities/device";
import { SearchEmptyState } from "./search-empty-state";

function model(id: string, name: string): DeviceModelListItemEntity {
  return {
    id,
    deviceBrandId: "brand",
    name,
    slug: id,
    series: null,
    releaseYear: null,
    brandName: "Apple",
    brandSlug: "apple",
    productCount: 10,
  };
}

// Already in popular order — the cached list the picker uses.
const POPULAR = [
  model("iphone-16-pro", "iPhone 16 Pro"),
  model("iphone-15-pro", "iPhone 15 Pro"),
  model("iphone-15", "iPhone 15"),
  model("iphone-13", "iPhone 13"),
  model("galaxy-s24-ultra", "Galaxy S24 Ultra"),
  model("galaxy-s24", "Galaxy S24"),
];

describe("SearchEmptyState — never a dead end (TASK-2069, Д3-2 §3.8)", () => {
  it("says nothing was found and offers the first five popular models", async () => {
    server.use(
      http.get("*/api/device-models", () =>
        HttpResponse.json({ data: POPULAR }),
      ),
    );
    renderWithProviders(<SearchEmptyState query="зарядка для тостера" />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: dict.searchDevice.empty.heading("зарядка для тостера"),
      }),
    ).toBeInTheDocument();

    const list = await screen.findByRole("list", {
      name: dict.searchDevice.empty.popularAria,
    });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "iPhone 16 Pro",
      "iPhone 15 Pro",
      "iPhone 15",
      "iPhone 13",
      "Galaxy S24 Ultra",
    ]);
    expect(links[0]).toHaveAttribute("href", "/devices/iphone-16-pro");
    expect(
      screen.getByText(new RegExp(dict.searchDevice.empty.popularLead)),
    ).toBeInTheDocument();
  });

  it("without the model list — no chips and no dangling lead-in", async () => {
    server.use(
      http.get("*/api/device-models", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(
      <SearchEmptyState
        query="x"
        action={<button type="button">reset</button>}
      />,
    );

    expect(screen.getByText(dict.searchDevice.empty.body)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reset" })).toBeInTheDocument();
  });
});
