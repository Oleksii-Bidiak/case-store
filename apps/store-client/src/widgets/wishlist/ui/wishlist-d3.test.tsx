import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import {
  getGetWishlistQueryKey,
  type WishlistItemEntity,
} from "@/entities/wishlist";
import {
  addDevice,
  clearMyDevices,
  type MyDeviceInput,
} from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { Toaster } from "@/shared/ui";
import { WishlistView } from "./wishlist-view";

// TASK-1300 · Д3-2 (Wishlist.dc.html): the device switch (off by default),
// the fit mark for every saved device, removal with «Повернути», the head's
// «Додати все в кошик · N» and the device-aware empty state.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/wishlist",
  useSearchParams: () => new URLSearchParams(""),
}));

const IPHONE: MyDeviceInput = {
  modelId: "m-ip15",
  slug: "iphone-15",
  name: "iPhone 15",
  brandName: "Apple",
  family: "iphone",
};
const GALAXY: MyDeviceInput = {
  modelId: "m-s24",
  slug: "galaxy-s24",
  name: "Galaxy S24",
  brandName: "Samsung",
  family: "galaxy",
};

/** Compatible models per product id, as the cards endpoint returns them. */
const compat: Record<string, string[]> = {
  ipcase: ["m-ip15"],
  scase: ["m-s24"],
  buds: [],
};

function item(
  id: string,
  name: string,
  overrides: Partial<WishlistItemEntity> = {},
): WishlistItemEntity {
  return {
    id: `i-${id}`,
    productId: id,
    productName: name,
    productSlug: id,
    imageUrl: null,
    price: "500",
    compareAtPrice: null,
    maxQty: 5,
    isActive: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const ITEMS = [
  item("ipcase", "iPhone Case", { createdAt: "2026-06-03T00:00:00.000Z" }),
  item("scase", "Galaxy Case", { createdAt: "2026-06-02T00:00:00.000Z" }),
  item("buds", "Earbuds", { createdAt: "2026-06-01T00:00:00.000Z" }),
];

function seededClient(items: WishlistItemEntity[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(getGetWishlistQueryKey(), {
    data: {
      id: "w1",
      userId: null,
      items,
      itemCount: items.length,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  });
  return client;
}

beforeEach(() => {
  window.localStorage.clear();
  clearMyDevices();
  server.use(
    http.get("*/api/products/cards", ({ request }) => {
      const ids =
        new URL(request.url).searchParams.get("ids")?.split(",") ?? [];
      return HttpResponse.json({
        data: ids.map((id) => ({
          id,
          categoryId: "cat-cases",
          brand: null,
          compatibleDeviceModelIds: compat[id] ?? [],
        })),
      });
    }),
    http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
  );
});

afterEach(() => act(() => clearMyDevices()));

describe("WishlistView · device switch (TASK-1300, Д3-2)", () => {
  it("is off by default and, on, keeps what fits the saved device", async () => {
    addDevice(IPHONE);
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(ITEMS),
    });

    const aside = screen.getByRole("complementary");
    const toggle = within(aside).getByRole("switch", {
      name: dict.filters.myDevices.title,
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      within(aside).getByText(dict.wishlist.devices.subOff),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);

    // Let the cards (compatibility) land before narrowing by it.
    await screen.findAllByText(dict.deviceFit.fits("iPhone 15"));
    await user.click(toggle);

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("iPhone Case")).toBeInTheDocument();
    expect(
      within(aside).getByText(dict.wishlist.devices.subOne("iPhone 15")),
    ).toBeInTheDocument();

    // The chip names the device; «Очистити все» turns the switch off again.
    expect(
      screen.getByRole("button", {
        name: dict.filters.myDevices.chipRemoveAria,
      }),
    ).toHaveTextContent(dict.filters.myDevices.chipFor("iPhone 15"));
    await user.click(
      screen.getByRole("button", { name: dict.filters.clearAll }),
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("keeps what fits ANY of several devices and chips them as a group", async () => {
    addDevice(IPHONE);
    addDevice(GALAXY);
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(ITEMS),
    });

    await screen.findByText(dict.wishlist.fitsDevices("iPhone 15"));
    await user.click(
      within(screen.getByRole("complementary")).getByRole("switch"),
    );

    // Both cases stay, the earbuds (no compatibility data) go.
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByText("Earbuds")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: dict.filters.myDevices.chipRemoveAria,
      }),
    ).toHaveTextContent(dict.wishlist.devices.chipMany(2));
  });

  it("offers no switch without a saved device", () => {
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(ITEMS),
    });
    const aside = screen.getByRole("complementary");
    expect(within(aside).queryByRole("switch")).not.toBeInTheDocument();
    expect(
      within(aside).getByText(dict.wishlist.devices.subNoDevice),
    ).toBeInTheDocument();
    // The head line for a guest without a device.
    expect(screen.getByText(dict.wishlist.subGuest)).toBeInTheDocument();
  });
});

describe("WishlistView · fit mark (TASK-1300, Д3-2 §18.5)", () => {
  it("answers for the one saved device like the catalogue card", async () => {
    addDevice(IPHONE);
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient(ITEMS),
    });

    expect(
      await screen.findByText(dict.deviceFit.fits("iPhone 15")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.deviceFit.notFor("iPhone 15")),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.wishlist.subWithDevice)).toBeInTheDocument();
  });

  it("names every fitting device when several are saved", async () => {
    addDevice(IPHONE);
    addDevice({ ...GALAXY, label: "Мама" });
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([ITEMS[0], ITEMS[1]]),
    });

    expect(
      await screen.findByText(dict.wishlist.fitsDevices("Galaxy S24 · Мама")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.wishlist.fitsDevices("iPhone 15")),
    ).toBeInTheDocument();
  });

  it("says a product fits none of the saved devices — neutrally", async () => {
    addDevice(IPHONE);
    addDevice(GALAXY);
    compat.other = ["m-pixel"];
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([item("other", "Pixel Case")]),
    });

    const mark = await screen.findByText(dict.wishlist.fitsNone);
    expect(mark.closest("[data-verdict]")).toHaveClass("bg-muted");
  });
});

describe("WishlistView · remove with «Повернути» (TASK-1300, Д3-2 §18.6)", () => {
  /** A wishlist server: DELETE drops, POST re-adds with a NEW createdAt. */
  function serveWishlist(initial: WishlistItemEntity[], deleteFails = false) {
    let saved = [...initial];
    const calls: string[] = [];
    server.use(
      http.get("*/api/wishlist", () =>
        HttpResponse.json({
          data: {
            id: "w1",
            userId: null,
            itemCount: saved.length,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
            items: saved,
          },
        }),
      ),
      http.delete("*/api/wishlist/items/:productId", ({ params }) => {
        calls.push(`DELETE ${String(params.productId)}`);
        if (deleteFails) {
          return HttpResponse.json({ message: "nope" }, { status: 500 });
        }
        saved = saved.filter((i) => i.productId !== params.productId);
        return HttpResponse.json({ data: {} });
      }),
      http.post("*/api/wishlist/items", async ({ request }) => {
        const body = (await request.json()) as { productId: string };
        calls.push(`POST ${body.productId}`);
        const original = initial.find((i) => i.productId === body.productId);
        if (original) {
          saved = [
            ...saved,
            { ...original, createdAt: "2026-07-01T00:00:00.000Z" },
          ];
        }
        return HttpResponse.json({ data: {} }, { status: 201 });
      }),
    );
    return calls;
  }

  it("removes at once and brings the item back to its place", async () => {
    const calls = serveWishlist(ITEMS);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <WishlistView />
        <Toaster />
      </>,
      { queryClient: seededClient(ITEMS) },
    );

    await user.click(
      screen.getByRole("button", {
        name: dict.productCard.wishlistRemoveAria("Galaxy Case"),
      }),
    );

    // Gone at once — no confirm dialog — with an undo in the toast.
    expect(screen.queryByText("Galaxy Case")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      await screen.findByText(dict.wishlist.removedToast("Galaxy Case")),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: dict.wishlist.undoRemove }),
    );

    await waitFor(() => expect(calls).toEqual(["DELETE scase", "POST scase"]));
    // Back in its saved place (second), not on top as «just added».
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("article")
          .map((card) => within(card).getAllByRole("link")[0].textContent),
      ).toEqual(["iPhone Case", "Galaxy Case", "Earbuds"]),
    );
  });

  it("puts the card back when the removal fails", async () => {
    serveWishlist(ITEMS, true);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <WishlistView />
        <Toaster />
      </>,
      { queryClient: seededClient(ITEMS) },
    );

    await user.click(
      screen.getByRole("button", {
        name: dict.productCard.wishlistRemoveAria("Earbuds"),
      }),
    );

    expect(await screen.findByText(dict.wishlist.error)).toBeInTheDocument();
    expect(await screen.findByText("Earbuds")).toBeInTheDocument();
  });
});

describe("WishlistView · head and empty state (TASK-1300, Д3-2)", () => {
  it("counts in-stock items on «Додати все в кошик» and flips once they are all in the cart", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(
          makeCart([
            makeCartItem({ id: "c1", productId: "ipcase" }),
            makeCartItem({ id: "c2", productId: "scase" }),
          ]),
        ),
      ),
    );
    renderWithProviders(<WishlistView />, {
      queryClient: seededClient([
        ITEMS[0],
        ITEMS[1],
        item("gone", "Sold Out", { maxQty: 0 }),
      ]),
    });

    // Before the cart lands: two in stock (the sold-out one is skipped).
    expect(
      screen.getByRole("button", { name: dict.wishlist.addAllCount(2) }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: dict.wishlist.addAllInCartAria }),
    ).toHaveAttribute("href", "/cart");
  });

  it("leads an empty wishlist to the saved device's hub", () => {
    addDevice(IPHONE);
    renderWithProviders(<WishlistView />, { queryClient: seededClient([]) });

    expect(
      screen.getByRole("link", {
        name: dict.wishlist.emptyDeviceCta("iPhone 15"),
      }),
    ).toHaveAttribute("href", "/devices/iphone-15");
  });
});
