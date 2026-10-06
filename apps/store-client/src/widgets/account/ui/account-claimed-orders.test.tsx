import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AccountClaimedOrders } from "./account-claimed-orders";

/**
 * The one-time "your guest orders are now yours" notice (TASK-485).
 *
 * The banner is deliberately dumb: it renders whatever the verification page
 * put in the URL, and nothing at all otherwise. Everything pinned here is about
 * NOT speaking — a banner that appeared without a claim behind it would be an
 * invitation to look for orders that were never attached.
 */

const d = dict.account.dashboard;

const replace = jest.fn();
let params = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => params,
}));

beforeEach(() => {
  replace.mockClear();
  params = new URLSearchParams();
});

describe("AccountClaimedOrders", () => {
  it("says how many orders were attached, and links to them", () => {
    params = new URLSearchParams("claimed=3");

    renderWithProviders(<AccountClaimedOrders />);

    expect(screen.getByText(d.claimedOrdersHeading)).toBeInTheDocument();
    expect(screen.getByText(d.claimedOrdersBody(3))).toBeInTheDocument();
    // TASK-217: to the account's order list, carrying the count so the list
    // shows the same notice above its tabs.
    expect(
      screen.getByRole("link", { name: d.claimedOrdersCta }),
    ).toHaveAttribute("href", "/account/orders?claimed=3");
  });

  it("drops the link on the order list itself, keeping «Зрозуміло» (TASK-217)", () => {
    params = new URLSearchParams("claimed=2");

    renderWithProviders(
      <AccountClaimedOrders ordersLink={false} className="mb-0" />,
    );

    expect(screen.getByRole("status")).toHaveClass("mb-0");
    expect(screen.getByRole("status")).not.toHaveClass("mb-4");
    expect(screen.getByText(d.claimedOrdersBody(2))).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.claimedOrdersDismiss }),
    ).toBeInTheDocument();
  });

  it("leaves the profile's «Зберегти» the only primary — outline + ghost (TASK-865)", () => {
    params = new URLSearchParams("claimed=2");

    const { container } = renderWithProviders(<AccountClaimedOrders />);

    expect(container.querySelectorAll(".bg-primary")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: d.claimedOrdersCta }),
    ).toHaveAttribute("data-variant", "outline");
    expect(
      screen.getByRole("button", { name: d.claimedOrdersDismiss }),
    ).toHaveAttribute("data-variant", "ghost");
  });

  it.each([
    ["no parameter at all", ""],
    ["a claim of zero — the normal case for everyone", "claimed=0"],
    ["a negative count", "claimed=-2"],
    ["a fraction", "claimed=1.5"],
    ["text somebody typed into the address bar", "claimed=всі"],
  ])("renders nothing for %s", (_label, query) => {
    params = new URLSearchParams(query);

    const { container } = renderWithProviders(<AccountClaimedOrders />);

    expect(container).toBeEmptyDOMElement();
  });

  it("drops the parameter when dismissed, so a reload does not repeat it", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams("claimed=2");

    renderWithProviders(<AccountClaimedOrders />);
    await user.click(
      screen.getByRole("button", { name: d.claimedOrdersDismiss }),
    );

    // `replace`, not `push`: the URL that announced a one-off event is not a
    // place worth being able to go back to.
    expect(replace).toHaveBeenCalledWith("/account");
  });

  it("keeps the rest of the query string when dismissed", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams("claimed=2&section=profile");

    renderWithProviders(<AccountClaimedOrders />);
    await user.click(
      screen.getByRole("button", { name: d.claimedOrdersDismiss }),
    );

    expect(replace).toHaveBeenCalledWith("/account?section=profile");
  });
});
