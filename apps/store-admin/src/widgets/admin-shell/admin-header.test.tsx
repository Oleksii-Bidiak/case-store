import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AdminHeader } from "./admin-header";

// LogoutButton (rendered inside the header) calls useRouter.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// Decouple the header from the real auth context/logout mutation — this suite
// asserts the burger's contract and the identity label, not sign-in state.
// `mockEmail` is swapped per-test to cover both identity states (TASK-255).
let mockEmail: string | null = null;

jest.mock("@/entities/session", () => ({
  useAuth: () => ({
    userId: "admin-1",
    role: "ADMIN",
    email: mockEmail,
    accessToken: null,
    isAuthenticated: true,
    isStaff: true,
    isOwner: true,
    isInitializing: false,
    permissions: [],
    arePermissionsLoading: false,
    can: () => true,
    canAll: () => true,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
  useAuthControllerLogout: () => ({ mutate: jest.fn(), isPending: false }),
}));

beforeEach(() => {
  mockEmail = null;
});

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

describe("AdminHeader — identity label (TASK-255)", () => {
  it("renders the admin's email when the profile fetch resolved", () => {
    mockEmail = "owner@store.ua";

    renderWithProviders(
      <AdminHeader mobileNavOpen={false} onOpenMobileNav={jest.fn()} />,
    );

    expect(screen.getByText("owner@store.ua")).toBeInTheDocument();
    expect(screen.queryByText(dict.header.adminLabel)).not.toBeInTheDocument();
  });

  it("falls back to the generic admin label when email is null", () => {
    mockEmail = null;

    renderWithProviders(
      <AdminHeader mobileNavOpen={false} onOpenMobileNav={jest.fn()} />,
    );

    expect(screen.getByText(dict.header.adminLabel)).toBeInTheDocument();
  });
});
