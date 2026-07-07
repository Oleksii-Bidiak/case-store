import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AdminHeader } from "./admin-header";

// LogoutButton (rendered inside the header) calls useRouter.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// Decouple the header from the real auth context/logout mutation — this suite
// only asserts the burger's contract, not sign-in state.
jest.mock("@/entities/session", () => ({
  useAuth: () => ({
    userId: "admin-1",
    role: "ADMIN",
    accessToken: null,
    isAuthenticated: true,
    isAdmin: true,
    isInitializing: false,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
  useAuthControllerLogout: () => ({ mutate: jest.fn(), isPending: false }),
}));

describe("AdminHeader — mobile burger", () => {
  it("renders the burger with its aria-label and aria-expanded=false when closed", () => {
    renderWithProviders(
      <AdminHeader mobileNavOpen={false} onOpenMobileNav={jest.fn()} />,
    );

    const burger = screen.getByRole("button", { name: dict.header.openMenu });
    expect(burger).toHaveAttribute("aria-expanded", "false");
  });

  it("reflects aria-expanded=true when the drawer is open", () => {
    renderWithProviders(
      <AdminHeader mobileNavOpen onOpenMobileNav={jest.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: dict.header.openMenu }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onOpenMobileNav when the burger is clicked", () => {
    const onOpenMobileNav = jest.fn();
    renderWithProviders(
      <AdminHeader mobileNavOpen={false} onOpenMobileNav={onOpenMobileNav} />,
    );

    fireEvent.click(screen.getByRole("button", { name: dict.header.openMenu }));

    expect(onOpenMobileNav).toHaveBeenCalledTimes(1);
  });
});
