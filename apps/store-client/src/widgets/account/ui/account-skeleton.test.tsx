import { render, renderWithProviders, screen } from "@/shared/test/render";
import { PAGE_CONTAINER } from "@/shared/config";
import {
  AccountProfileSkeleton,
  AccountShellSkeleton,
} from "./account-skeleton";
import { AccountShell } from "./account-shell";
import { makeUser } from "@/shared/test/msw-handlers";
import { ACCOUNT_NAV } from "./account-nav";
import { AccountEmailVerification } from "./account-email-verification";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

function FullSkeleton() {
  return (
    <AccountShellSkeleton>
      <AccountProfileSkeleton />
    </AccountShellSkeleton>
  );
}

/**
 * TASK-869 — `/account` had three different skeletons (a narrow centred card,
 * the same inside a `py-8` wrapper, and two bars in AccountView). Now there is
 * one: the shell frame (TASK-217) with the route's content skeleton inside.
 */
describe("AccountShellSkeleton (TASK-869 / TASK-217)", () => {
  it("is hidden from assistive tech", () => {
    render(<FullSkeleton />);
    expect(screen.getByTestId("account-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("carries AccountShell's container and top padding itself", () => {
    render(<FullSkeleton />);
    const root = screen.getByTestId("account-skeleton");
    expect(root).toHaveClass(...PAGE_CONTAINER.split(" "), "pt-5.5", "pb-16");
    expect(root).not.toHaveClass("max-w-2xl");
    expect(screen.getByTestId("account-skeleton-back")).toHaveClass(
      "flex",
      "mb-5.5",
      "h-5",
    );
  });

  it("keeps the frame's geometry in step with the real shell", async () => {
    // Drift guard: the same container, back line, layout row and menu width.
    renderWithProviders(
      <AccountShell>
        <p>route content</p>
      </AccountShell>,
      { auth: { isAuthenticated: true } },
    );
    await screen.findByText("route content");
    expect(screen.getByTestId("account-shell")).toHaveClass(
      ...PAGE_CONTAINER.split(" "),
      "pt-5.5",
      "pb-16",
    );
    const aside = screen.getByTestId("account-aside");
    expect(aside).toHaveClass("hidden", "lg:block", "lg:w-66", "lg:shrink-0");
    expect(aside.parentElement).toHaveClass(
      "flex",
      "flex-col",
      "gap-7",
      "lg:flex-row",
    );
  });

  it("lays out a 264px menu beside the content from lg only", () => {
    render(<FullSkeleton />);
    const layout = screen.getByTestId("account-skeleton-layout");
    expect(layout).toHaveClass("flex", "flex-col", "gap-7", "lg:flex-row");
    expect(screen.getByTestId("account-skeleton-aside")).toHaveClass(
      "hidden",
      "lg:block",
      "lg:w-66",
      "lg:shrink-0",
      "rounded-card",
      "shadow-card",
    );
  });

  it("reserves the chip strip below lg, one 44px chip per ACCOUNT_NAV entry", () => {
    render(<FullSkeleton />);
    expect(screen.getByTestId("account-skeleton-strip")).toHaveClass(
      "lg:hidden",
      "mb-5",
      "-mx-4",
      "sm:-mx-6",
    );
    const chips = screen.getAllByTestId("account-skeleton-chip");
    expect(chips).toHaveLength(ACCOUNT_NAV.length);
    for (const chip of chips) expect(chip).toHaveClass("h-11", "rounded-full");
  });

  it("drops the strip and hides the back line below lg on an order detail", () => {
    render(<AccountShellSkeleton detail />);
    expect(
      screen.queryByTestId("account-skeleton-strip"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("account-skeleton-back")).toHaveClass(
      "hidden",
      "lg:flex",
    );
    // The sidebar remains from lg.
    expect(screen.getByTestId("account-skeleton-aside")).toHaveClass(
      "lg:block",
    );
  });

  it("reserves one 42px menu row per visible ACCOUNT_NAV entry inside a flex column", () => {
    render(<FullSkeleton />);
    const rows = screen.getAllByTestId("account-skeleton-nav-row");
    expect(rows).toHaveLength(ACCOUNT_NAV.length);
    for (const row of rows) expect(row).toHaveClass("h-10.5", "mb-0.5");
    // Block layout would collapse the last row's margin into the divider.
    expect(screen.getByTestId("account-skeleton-nav")).toHaveClass(
      "flex",
      "flex-col",
    );
  });

  it("is what AccountShell renders while the session initialises", () => {
    renderWithProviders(
      <AccountShell>
        <p>route content</p>
      </AccountShell>,
      { auth: { isInitializing: true, isAuthenticated: false } },
    );
    expect(screen.getByTestId("account-skeleton")).toBeInTheDocument();
    // On /account the content column is the profile skeleton.
    expect(screen.getByTestId("account-profile-skeleton")).toBeInTheDocument();
  });
});

describe("AccountProfileSkeleton (TASK-869)", () => {
  it("is content-only: no container of its own", () => {
    render(<AccountProfileSkeleton />);
    const root = screen.getByTestId("account-profile-skeleton");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("max-w-170");
    expect(root).not.toHaveClass("mx-auto", "pt-5.5");
  });

  it("reserves the h1 slot at H1_CLASS line heights and both profile cards", () => {
    render(<AccountProfileSkeleton />);
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
    render(<AccountProfileSkeleton />);
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
    render(<AccountProfileSkeleton />);
    expect(screen.getByTestId("account-skeleton-note-wrap")).toHaveClass(
      "sm:hidden",
    );
  });
});
