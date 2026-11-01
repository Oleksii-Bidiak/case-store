import { http, HttpResponse } from "msw";
import { ThemeProvider } from "next-themes";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { Header } from "./header";

/** Not the `SITE_NAME` fallback — proves the wordmark comes from the prop (TASK-546). */
const STORE_NAME = "Аксесуарня";

// next/navigation is unavailable under jsdom — the header's logout and the
// search autocomplete both reach for the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * Header — the responsive class contract (TASK-539).
 *
 * The header row is the most-edited file of wave 174 (TASK-410/411/413/504),
 * and its breakpoints are measured, not guessed: at 768px the full desktop
 * cluster needs 886px of a 736px row, and before these classes the overflow was
 * billed to the brand, which collapsed to a few pixels. jsdom has no layout and
 * Playwright's spec measures document width, not what is visible — so the
 * classes that decide who yields are pinned here, where a drive-by "cleanup"
 * would turn this suite red instead of squeezing the logo on a real tablet.
 */
function renderHeader(options?: Parameters<typeof renderWithProviders>[1]) {
  server.use(
    // HeaderSearch's mega-menu fires the tree request on mount.
    http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
    // HeaderWishlistBadge reads the (guest) wishlist once auth settles.
    http.get("*/api/wishlist", () =>
      HttpResponse.json({ data: { items: [], itemCount: 0 } }),
    ),
  );
  return renderWithProviders(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <Header siteName={STORE_NAME} />
    </ThemeProvider>,
    options,
  );
}

/** The class list of an element, for exact-token assertions. */
function classesOf(element: Element | null | undefined): string[] {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

describe("Header — responsive class contract (TASK-539)", () => {
  it("hides Обране below 390px and shows it from there", () => {
    renderHeader();

    const wishlist = screen.getByRole("link", {
      name: dict.wishlist.headerAria,
    });
    // Both halves: hidden on the narrowest phones (four targets would collide
    // there — the slide-out menu carries the link), flex from 390px.
    expect(classesOf(wishlist)).toEqual(
      expect.arrayContaining(["hidden", "min-[390px]:flex"]),
    );
  });

  it("hides Кабінет below 390px and shows it from there", () => {
    renderHeader();

    // Guests get the slide-out trigger; its wrapper owns the breakpoint.
    const account = screen.getByRole("button", {
      name: dict.header.accountOpenAria,
    });
    const wrapper = account.closest("div.hidden");
    expect(wrapper).not.toBeNull();
    expect(classesOf(wrapper)).toEqual(
      expect.arrayContaining(["hidden", "min-[390px]:block"]),
    );
  });

  it("keeps the slide-out menu trigger until xl, at a full touch target", () => {
    renderHeader();

    const trigger = screen.getByRole("button", { name: dict.header.openMenu });
    // `xl` (TASK-511/512, after TASK-413/504's `lg`): below 1280 the menu
    // carries Товари/Блог and the theme switch, so the row can give its width
    // to the search input — ≈317px at 1024 instead of ~79.
    expect(classesOf(trigger)).toEqual(
      expect.arrayContaining(["xl:hidden", "size-11", "shrink-0"]),
    );
    expect(classesOf(trigger)).not.toContain("md:hidden");
    expect(classesOf(trigger)).not.toContain("lg:hidden");
  });

  it("shows the one-button theme toggle from exactly xl (TASK-2073)", () => {
    renderHeader();

    // jsdom's matchMedia stub answers `false`, so "system" resolves to light
    // and the button offers dark. No radiogroup in the row any more.
    const button = screen.getByRole("button", { name: dict.theme.enableDark });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    // The same `xl` the menu trigger disappears at — together they cover every
    // width with no gap (TASK-504 caught the old `min-[1100px]` gap). 44×44.
    expect(classesOf(button)).toEqual(
      expect.arrayContaining(["hidden", "xl:inline-flex", "size-11"]),
    );
    expect(classesOf(button)).not.toContain("lg:inline-flex");
    // tailwind-merge must drop the base `inline-flex`, or it shows below xl.
    expect(classesOf(button)).not.toContain("inline-flex");
  });

  it("shows the Товари / Блог row from exactly xl (TASK-512)", () => {
    renderHeader();

    const nav = screen.getByRole("navigation", { name: dict.nav.primaryAria });
    expect(classesOf(nav)).toEqual(
      expect.arrayContaining(["hidden", "xl:flex"]),
    );
    expect(classesOf(nav)).not.toContain("lg:flex");
  });

  it("renders Акції / Обране / Кабінет as named 44×44 icons, captions from xl (TASK-511)", async () => {
    renderHeader();

    const actions = [
      screen.getByRole("link", { name: dict.header.promoLabel }),
      screen.getByRole("link", { name: dict.wishlist.headerAria }),
      // The guest trigger replaces the skeleton once the session settles.
      await screen.findByRole("button", { name: dict.header.accountOpenAria }),
    ];
    for (const action of actions) {
      // The caption is display:none below `xl`, so the accessible name must
      // come from aria-label — never from the hidden text.
      expect(action).toHaveAttribute("aria-label");
      expect(classesOf(action)).toEqual(
        expect.arrayContaining(["min-h-11", "min-w-11"]),
      );
      const caption = action.querySelector("span");
      expect(classesOf(caption)).toEqual(
        expect.arrayContaining(["hidden", "xl:inline"]),
      );
      expect(classesOf(caption)).not.toContain("sm:inline");
    }
  });

  it("names the home link and the slide-out menu with the store name it is given (TASK-546)", async () => {
    const user = userEvent.setup();
    renderHeader();

    // The wordmark is the link's accessible name — the admin-managed name, not
    // the code constant.
    expect(screen.getByRole("link", { name: STORE_NAME })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByText("CaseStore")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: dict.header.openMenu }),
    );
    expect(
      await screen.findByRole("dialog", { name: STORE_NAME }),
    ).toBeInTheDocument();
  });

  it("carries everything the row hides below xl in the slide-out menu", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(
      screen.getByRole("button", { name: dict.header.openMenu }),
    );
    const menu = await screen.findByRole("dialog");

    // Товари / Блог and the theme switch are not in the row until `xl`.
    expect(
      within(menu).getByRole("link", { name: dict.nav.products }),
    ).toHaveAttribute("href", "/products");
    expect(
      within(menu).getByRole("link", { name: dict.nav.blog }),
    ).toHaveAttribute("href", "/blog");
    expect(
      within(menu).getByRole("switch", { name: dict.theme.darkRow }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("lets the brand cluster, not the commerce actions, yield on a narrow row", () => {
    renderHeader();

    const trigger = screen.getByRole("button", { name: dict.header.openMenu });
    const brandCluster = trigger.parentElement;
    // `min-w-0` on the cluster AND on the logo link: only a shrinkable flex
    // child lets the wordmark truncate instead of pushing the cart off-canvas.
    expect(classesOf(brandCluster)).toContain("min-w-0");
    const logoLink = brandCluster?.querySelector('a[href="/"]');
    expect(classesOf(logoLink)).toEqual(
      expect.arrayContaining(["flex", "min-w-0"]),
    );

    // The action cluster keeps its size: it is `shrink-0`.
    const cart = screen.getByRole("button", { name: dict.cart.openAria });
    expect(classesOf(cart.closest("div.ml-auto"))).toContain("shrink-0");
  });

  it("keeps the phone action spacing tight so the 44×44 icons leave the wordmark whole at 390", () => {
    renderHeader();

    // Measured (e2e/header-widths): with Обране / Кабінет at 44×44, the old
    // `gap-1` + cart `ml-1` cut the wordmark to «CaseSt…» at 390. The spacing
    // opens up again from `sm`, where the row has room.
    const cart = screen.getByRole("button", { name: dict.cart.openAria });
    const cluster = cart.closest("div.ml-auto");
    expect(classesOf(cluster)).toEqual(
      expect.arrayContaining(["gap-0.5", "sm:gap-1.5"]),
    );
    expect(classesOf(cluster)).not.toContain("gap-1");
    expect(classesOf(cart)).toContain("sm:ml-1");
    expect(classesOf(cart)).not.toContain("ml-1");
  });
});

/**
 * TASK-1999 — «Статус замовлення» (/orders/status) is how a guest finds an
 * order once the letter is gone, and the footer used to be the only way in.
 * A signed-in shopper has «Мої замовлення» instead, so they are not offered it.
 */
describe("Header — the order-status lookup for guests (TASK-1999)", () => {
  it("shows guests a named 44×44 «Статус замовлення» action from exactly xl", async () => {
    renderHeader();

    const status = await screen.findByRole("link", {
      name: dict.header.orderStatusLink,
    });
    expect(status).toHaveAttribute("href", "/orders/status");
    // Desktop only: below `xl` the slide-out menu carries it (next test).
    expect(classesOf(status)).toEqual(
      expect.arrayContaining(["hidden", "xl:flex", "min-h-11", "min-w-11"]),
    );
  });

  it("reserves the action's box while the session restores — no shift for guests", () => {
    // The theme button is the cluster's leftmost item, so an action that only
    // appears once auth settles moved it under the cursor: a click aimed at
    // the old «Світла» segment landed between segments (e2e/theme.spec.ts).
    renderHeader({ auth: { isInitializing: true } });

    expect(
      screen.queryByRole("link", { name: dict.header.orderStatusLink }),
    ).toBeNull();
    const placeholder = document.querySelector(
      '[data-slot="order-status-placeholder"]',
    );
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    // The same box the link settles into: its classes, made invisible.
    expect(classesOf(placeholder)).toEqual(
      expect.arrayContaining([
        "invisible",
        "hidden",
        "xl:flex",
        "min-h-11",
        "min-w-11",
      ]),
    );
    expect(placeholder).toHaveTextContent(dict.header.orderStatusCaption);
  });

  it("lists «Статус замовлення» in the guest's slide-out menu", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(
      screen.getByRole("button", { name: dict.header.openMenu }),
    );
    const menu = await screen.findByRole("dialog");

    expect(
      within(menu).getByRole("link", { name: dict.header.orderStatusLink }),
    ).toHaveAttribute("href", "/orders/status");
  });

  it("offers it to nobody signed in — they have «Мої замовлення»", async () => {
    const user = userEvent.setup();
    renderHeader({ auth: { isAuthenticated: true, accessToken: "token" } });

    // The row first — the open menu would hide it from the a11y tree.
    expect(
      await screen.findByRole("button", {
        name: dict.header.accountTriggerAria,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.header.orderStatusLink }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: dict.header.openMenu }),
    );
    const menu = await screen.findByRole("dialog");

    expect(
      within(menu).getByRole("link", { name: dict.account.ordersLink }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("link", { name: dict.header.orderStatusLink }),
    ).toBeNull();
  });
});

// TASK-2072: the «Каталог» menus are slots the app layer fills
// (app/site-header.tsx) — the header only mounts them.
describe("Header — the catalog slots (TASK-2072)", () => {
  function renderWithSlots() {
    server.use(
      http.get("*/api/categories/tree", () => HttpResponse.json({ data: [] })),
      http.get("*/api/wishlist", () =>
        HttpResponse.json({ data: { items: [], itemCount: 0 } }),
      ),
    );
    return renderWithProviders(
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
        <Header
          siteName={STORE_NAME}
          renderCatalogMenu={() => <p>mega-slot</p>}
          renderCatalogDrill={({ onNavigate }) => (
            <button type="button" onClick={onNavigate}>
              drill-slot
            </button>
          )}
        />
      </ThemeProvider>,
    );
  }

  it("mounts the drill inside the slide-out menu and lets it close the menu", async () => {
    const user = userEvent.setup();
    renderWithSlots();

    await user.click(
      screen.getByRole("button", { name: dict.header.openMenu }),
    );
    const menu = await screen.findByRole("dialog");
    await user.click(within(menu).getByRole("button", { name: "drill-slot" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("below lg, «Каталог» opens the slide-out menu instead of the mega menu", async () => {
    // jsdom's matchMedia stub matches nothing: a viewport below `lg`.
    const user = userEvent.setup();
    renderWithSlots();

    await user.click(
      screen.getByRole("button", { name: dict.header.catalogAria }),
    );

    const menu = await screen.findByRole("dialog");
    expect(
      within(menu).getByRole("button", { name: "drill-slot" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("mega-slot")).not.toBeInTheDocument();
  });
});
