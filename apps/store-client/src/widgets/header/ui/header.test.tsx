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
function renderHeader() {
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
      <Header />
    </ThemeProvider>,
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

  it("shows the header theme switch from exactly xl", () => {
    renderHeader();

    // With the menu closed, the header's own switch is the only radiogroup.
    const group = screen.getByRole("radiogroup", {
      name: dict.header.themeAria,
    });
    const host = group.parentElement;
    // The same `xl` the menu trigger disappears at — together they cover every
    // width with no gap (TASK-504 caught the old `min-[1100px]` gap).
    expect(classesOf(host)).toEqual(
      expect.arrayContaining(["hidden", "xl:flex"]),
    );
    expect(classesOf(host)).not.toContain("lg:flex");
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
      within(menu).getByRole("radiogroup", { name: dict.header.themeAria }),
    ).toBeInTheDocument();
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
