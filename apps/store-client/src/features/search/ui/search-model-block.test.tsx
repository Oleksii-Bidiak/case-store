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
import { MY_DEVICES_STORAGE_KEY } from "@/entities/my-devices";
import { SearchAutocomplete } from "./search-autocomplete";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
  model("iphone-15", "iPhone 15", { productCount: 96 }),
  model("iphone-15-plus", "iPhone 15 Plus", { productCount: 40 }),
];

function saveDevices(ids: string[]) {
  const now = Date.now();
  window.localStorage.setItem(
    MY_DEVICES_STORAGE_KEY,
    JSON.stringify(
      ids.map((id, i) => {
        const m = MODELS.find((x) => x.id === id)!;
        return {
          modelId: m.id,
          slug: m.slug,
          name: m.name,
          brandName: m.brandName,
          family: "iphone",
          lastUsedAt: now - i * 1000,
        };
      }),
    ),
  );
}

beforeEach(() => {
  mockPush.mockClear();
  window.localStorage.clear();
  server.use(
    http.get("*/api/search/suggest", () => HttpResponse.json({ data: [] })),
    http.get("*/api/blog/suggest", () => HttpResponse.json({ data: [] })),
    http.get("*/api/device-models", () => HttpResponse.json({ data: MODELS })),
  );
});

async function typeQuery(text: string) {
  const user = userEvent.setup();
  renderWithProviders(<SearchAutocomplete />);
  const input = screen.getByRole("combobox", { name: dict.search.inputAria });
  await user.type(input, text);
  return { user, input };
}

const block = (name: string) =>
  screen.findByRole("group", {
    name: dict.searchDevice.suggest.blockAria(name),
  });

describe("SearchAutocomplete — the model block (TASK-2069)", () => {
  it("recognises a Cyrillic model query and links to its hub first", async () => {
    await typeQuery("айфон 15 про");

    const group = await block("iPhone 15 Pro");
    expect(
      within(group).getByText(dict.searchDevice.suggest.kickerCorrected),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("link", {
        name: dict.searchDevice.suggest.allFor("iPhone 15 Pro", 128),
      }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");
    // «Все для iPhone 15 Pro · 128 товарів»
    expect(dict.searchDevice.suggest.allFor("iPhone 15 Pro", 128)).toBe(
      "Все для iPhone 15 Pro · 128 товарів",
    );
    // The block sits outside the product listbox.
    const listbox = screen.getByRole("listbox", {
      name: dict.search.inputAria,
    });
    expect(listbox).not.toContainElement(group);
  });

  it("offers the other models the words fit under «Також:»", async () => {
    await typeQuery("iphone 15");

    await block("iPhone 15");
    expect(screen.getByText(dict.searchDevice.suggest.alsoLabel)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "iPhone 15 Pro Max" }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro-max");
  });

  it("adds a new model to «Мої пристрої» in place, keeping the popup open", async () => {
    const { user } = await typeQuery("iphone 15 pro");

    const group = await block("iPhone 15 Pro");
    await user.click(
      within(group).getByRole("button", {
        name: dict.searchDevice.action.add,
      }),
    );

    await waitFor(() =>
      expect(
        within(group).getByText(dict.searchDevice.action.mine),
      ).toBeInTheDocument(),
    );
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    const stored = JSON.parse(
      window.localStorage.getItem(MY_DEVICES_STORAGE_KEY) ?? "[]",
    );
    expect(stored[0].modelId).toBe("iphone-15-pro");
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("offers «Показувати для нього» for a saved model that is not active", async () => {
    saveDevices(["iphone-15", "iphone-15-pro"]);
    const { user } = await typeQuery("iphone 15 pro");

    const group = await block("iPhone 15 Pro");
    await user.click(
      within(group).getByRole("button", {
        name: dict.searchDevice.action.activate,
      }),
    );
    await waitFor(() =>
      expect(
        within(group).getByText(dict.searchDevice.action.mine),
      ).toBeInTheDocument(),
    );
  });

  it("shows «Ваш пристрій» (not a button) for the active model", async () => {
    saveDevices(["iphone-15-pro"]);
    await typeQuery("iphone 15 pro");

    const group = await block("iPhone 15 Pro");
    expect(
      within(group).getByText(dict.searchDevice.action.mine),
    ).toBeVisible();
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
  });

  it("adds no block when the query names no model", async () => {
    await typeQuery("чохол");

    await screen.findByText(dict.search.empty);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
