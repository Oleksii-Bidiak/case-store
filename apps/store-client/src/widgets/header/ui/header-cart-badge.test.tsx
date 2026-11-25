import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dict } from "@/shared/config";
import { HeaderCartBadge } from "./header-cart-badge";

const loadCartSheet = jest.fn<Promise<boolean>, []>();

jest.mock("@/widgets/cart", () => ({
  LazyCartSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" /> : null,
  loadCartSheet: () => loadCartSheet(),
  preloadCartSheet: jest.fn(),
}));
jest.mock("@/entities/cart", () => ({
  useGetCart: () => ({ data: undefined }),
}));
jest.mock("@/entities/session", () => ({
  useAuth: () => ({ isInitializing: false }),
}));

// TASK-2524: the mini-cart's code loads on the first open. If that load fails,
// the open must be undone — otherwise a later successful load (a hover preload)
// would pop the sheet open on its own, long after the click.
describe("HeaderCartBadge — a failed load of the mini-cart (TASK-2524)", () => {
  it("opens the sheet when its code arrives", async () => {
    loadCartSheet.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<HeaderCartBadge />);

    await user.click(screen.getByRole("button", { name: dict.cart.openAria }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("takes the open back when its code fails to load", async () => {
    loadCartSheet.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<HeaderCartBadge />);

    await user.click(screen.getByRole("button", { name: dict.cart.openAria }));
    await act(async () => {});

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
