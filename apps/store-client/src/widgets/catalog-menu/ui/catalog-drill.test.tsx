import { http, HttpResponse, delay } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  MY_DEVICES_STORAGE_KEY,
  closeDevicePicker,
  getDevicePickerState,
  type MyDevice,
} from "@/entities/my-devices";
import { CatalogDrill } from "./catalog-drill";
import { CATALOG_TREE, blockNavigation } from "./test-fixtures";

const t = dict.catalogMenu.drill;

function device(slug: string, name: string, lastUsedAt: number): MyDevice {
  return {
    modelId: `id-${slug}`,
    slug,
    name,
    brandName: "Apple",
    family: "iphone",
    lastUsedAt,
  };
}

let unblockNavigation = () => {};

beforeEach(() => {
  window.localStorage.clear();
  unblockNavigation = blockNavigation();
  server.use(
    http.get("*/api/categories/tree", () =>
      HttpResponse.json({ data: CATALOG_TREE }),
    ),
  );
});

afterEach(() => {
  unblockNavigation();
  act(() => closeDevicePicker());
});

function renderDrill() {
  const onNavigate = jest.fn();
  const user = userEvent.setup();
  renderWithProviders(<CatalogDrill onNavigate={onNavigate} />);
  return { onNavigate, user };
}

function heading() {
  return screen.getByRole("heading", { level: 3 });
}

describe("CatalogDrill — levels (TASK-2072)", () => {
  it("opens on the roots: a root with children drills, a childless one navigates", async () => {
    renderDrill();

    expect(
      await screen.findByRole("button", { name: "Чохли" }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.header.catalogButton)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Карти пам’яті та флешки" }),
    ).toHaveAttribute("href", "/categories/memory");
    // Level 2 is not on screen until a root is opened.
    expect(
      screen.queryByRole("button", { name: "Чохли для iPhone" }),
    ).not.toBeInTheDocument();
  });

  it("drills down to level 4 with the back label, the trail and «Усі товари «…»»", async () => {
    const { user } = renderDrill();

    await user.click(await screen.findByRole("button", { name: "Чохли" }));
    expect(heading()).toHaveTextContent("Чохли");
    // Level 2: the back button reads «Каталог», there is no trail yet.
    expect(
      screen.getByRole("button", {
        name: t.backAria(dict.header.catalogButton),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.allProductsIn("Чохли") }),
    ).toHaveAttribute("href", "/categories/cases");
    expect(screen.queryByText(/›/)).not.toBeInTheDocument();
    // The roots are gone.
    expect(
      screen.queryByRole("button", { name: "Кабелі та перехідники" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Чохли для iPhone" }));
    expect(heading()).toHaveTextContent("Чохли для iPhone");
    expect(
      screen.getByRole("button", { name: t.backAria("Чохли") }),
    ).toBeInTheDocument();
    // From level 3 the ancestors line appears.
    expect(screen.getByText("Чохли", { selector: "p" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "З MagSafe" }));
    expect(heading()).toHaveTextContent("З MagSafe");
    expect(screen.getByText("Чохли › Чохли для iPhone")).toBeInTheDocument();

    // Level 4 is always a link — the tree has nothing deeper.
    expect(
      screen.getByRole("link", { name: "Силіконові з MagSafe" }),
    ).toHaveAttribute("href", "/categories/magsafe-silicone");
  });

  it("moves focus to the new heading on the way in and to the origin row on the way out", async () => {
    const { user } = renderDrill();

    await user.click(await screen.findByRole("button", { name: "Чохли" }));
    expect(heading()).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Чохли для iPhone" }));
    await user.click(screen.getByRole("button", { name: t.backAria("Чохли") }));
    expect(
      screen.getByRole("button", { name: "Чохли для iPhone" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", {
        name: t.backAria(dict.header.catalogButton),
      }),
    );
    expect(screen.getByRole("button", { name: "Чохли" })).toHaveFocus();
  });

  it("works from the keyboard alone", async () => {
    const { user } = renderDrill();
    const cases = await screen.findByRole("button", { name: "Чохли" });
    act(() => cases.focus());

    await user.keyboard("{Enter}");
    expect(heading()).toHaveTextContent("Чохли");
  });

  it("closes the sheet on every link", async () => {
    const { user, onNavigate } = renderDrill();

    await user.click(
      await screen.findByRole("button", { name: "Кабелі та перехідники" }),
    );
    await user.click(
      screen.getByRole("link", {
        name: t.allProductsIn("Кабелі та перехідники"),
      }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("CatalogDrill — device row", () => {
  it("without a device: the dashed pick button closes the sheet and opens the picker", async () => {
    const { user, onNavigate } = renderDrill();

    await user.click(
      screen.getByRole("button", { name: dict.devicePicker.bar.pick }),
    );

    expect(onNavigate).toHaveBeenCalled();
    expect(getDevicePickerState().open).toBe(true);
  });

  it("with one device: «Все для …» to its hub and «Додати ще пристрій»", () => {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([device("iphone-15-pro", "iPhone 15 Pro", 2)]),
    );
    renderDrill();

    expect(
      screen.getByRole("link", { name: t.allFor("iPhone 15 Pro") }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");
    expect(
      screen.getByRole("button", { name: t.addAnother }),
    ).toBeInTheDocument();
  });

  it("with three devices: the second button counts the other two", async () => {
    window.localStorage.setItem(
      MY_DEVICES_STORAGE_KEY,
      JSON.stringify([
        device("iphone-15-pro", "iPhone 15 Pro", 3),
        device("iphone-13", "iPhone 13", 2),
        device("iphone-12", "iPhone 12", 1),
      ]),
    );
    const { user, onNavigate } = renderDrill();

    await user.click(screen.getByRole("button", { name: t.otherDevices(2) }));

    expect(onNavigate).toHaveBeenCalled();
    expect(getDevicePickerState().open).toBe(true);
  });
});

describe("CatalogDrill — states", () => {
  it("shows skeleton rows while the tree is loading", () => {
    server.use(
      http.get("*/api/categories/tree", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
    );
    renderDrill();

    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(5);
    expect(
      screen.queryByText(dict.header.catalogButton),
    ).not.toBeInTheDocument();
  });

  it("shows the error state when the tree request fails", async () => {
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json(
          { error: "Internal", message: "boom", statusCode: 500 },
          { status: 500 },
        ),
      ),
    );
    renderDrill();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.catalog.categoriesError,
    );
  });

  it("renders no catalog section for an empty tree, keeping the device row", async () => {
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
    );
    renderDrill();

    // The skeleton goes once the empty response lands…
    await waitFor(() =>
      expect(screen.queryAllByRole("status", { hidden: true })).toHaveLength(0),
    );
    // …and leaves no caption, no list, no error — only the device row.
    expect(
      screen.queryByText(dict.header.catalogButton),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.devicePicker.bar.pick }),
    ).toBeInTheDocument();
  });
});
