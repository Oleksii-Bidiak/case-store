import { render, renderWithProviders, screen } from "@/shared/test/render";
import { PAGE_CONTAINER } from "@/shared/config";
import { AccountSkeleton } from "./account-skeleton";
import { AccountView } from "./account-view";
import { makeUser } from "@/shared/test/msw-handlers";
import { ACCOUNT_NAV } from "./account-nav";
import { AccountEmailVerification } from "./account-email-verification";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * TASK-869 — `/account` had three different skeletons (a narrow centred card,
 * the same inside a `py-8` wrapper, and two bars in AccountView). Now there is
 * one, and it is the dashboard with the content blanked out.
 */
describe("AccountSkeleton (TASK-869)", () => {
  it("is hidden from assistive tech", () => {
    render(<AccountSkeleton />);
    expect(screen.getByTestId("account-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("carries AccountView's container and top padding itself", () => {
    render(<AccountSkeleton />);
    const root = screen.getByTestId("account-skeleton");
    expect(root).toHaveClass(...PAGE_CONTAINER.split(" "), "pt-5.5", "pb-16");
    expect(root).not.toHaveClass("max-w-2xl");
    expect(screen.getByTestId("account-skeleton-back")).toHaveClass(
      "mb-5.5",
      "h-5",
    );
  });

  it("lays out a 264px menu beside the content from lg and stacks them below", () => {
    render(<AccountSkeleton />);
    const layout = screen.getByTestId("account-skeleton-layout");
    expect(layout).toHaveClass("flex", "flex-col", "gap-7", "lg:flex-row");
    expect(screen.getByTestId("account-skeleton-aside")).toHaveClass(
      "lg:w-66",
      "lg:shrink-0",
      "rounded-card",
      "shadow-card",
    );
  });

  it("reserves one 44px menu row per visible ACCOUNT_NAV entry inside a flex column", () => {
    render(<AccountSkeleton />);
    const rows = screen.getAllByTestId("account-skeleton-nav-row");
    expect(rows).toHaveLength(ACCOUNT_NAV.length);
    for (const row of rows) expect(row).toHaveClass("h-10.5", "mb-0.5");
    // Block layout would collapse the last row's margin into the divider.
    expect(screen.getByTestId("account-skeleton-nav")).toHaveClass(
      "flex",
      "flex-col",
    );
  });

  it("reserves the h1 slot at H1_CLASS line heights and both profile cards", () => {
    render(<AccountSkeleton />);
    expect(screen.getByTestId("account-skeleton-title")).toHaveClass(
      "h-9",
      "md:h-10",
    );
    const cards = screen.getAllByTestId("account-skeleton-card");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toHaveClass("rounded-card", "p-6.5", "shadow-card");
    }
  });

  // Fix round: the seeded customer and every new registration land on the
  // «Адресу не підтверджено» card, and a one-line status slot let the contact
  // and security cards drop 138px (158px at 390) when the profile arrived.
  it("reserves the unverified email card, shaped like AccountEmailVerification's", () => {
    render(<AccountSkeleton />);
    const card = screen.getByTestId("account-skeleton-verification");
    expect(card).toHaveClass(
      "mb-4",
      "rounded-2xl",
      "border",
      "p-6",
      "shadow-card",
    );
    // The body wraps onto a second line below sm, like the real copy.
    expect(
      screen.getByTestId("account-skeleton-verification-wrap"),
    ).toHaveClass("sm:hidden");
    // It sits between the h1 slot and the contact card.
    const [contact] = screen.getAllByTestId("account-skeleton-card");
    expect(
      card.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the reserved card's box in step with the real unverified card", () => {
    // Drift guard: restyle the real card and this fails, instead of the
    // skeleton silently going back to jumping.
    renderWithProviders(
      <AccountEmailVerification
        user={{ ...makeUser().data, emailVerifiedAt: null }}
      />,
      { auth: { isAuthenticated: true } },
    );
    const real = screen.getByRole("heading", { level: 2 }).parentElement;
    expect(real).toHaveClass("mb-4", "rounded-2xl", "border", "p-6");
  });

  it("wraps the security note onto a second line only below sm", () => {
    render(<AccountSkeleton />);
    expect(screen.getByTestId("account-skeleton-note-wrap")).toHaveClass(
      "sm:hidden",
    );
  });

  it("is what AccountView renders while the session initialises", () => {
    renderWithProviders(<AccountView />, {
      auth: { isInitializing: true, isAuthenticated: false },
    });
    expect(screen.getByTestId("account-skeleton")).toBeInTheDocument();
  });
});
