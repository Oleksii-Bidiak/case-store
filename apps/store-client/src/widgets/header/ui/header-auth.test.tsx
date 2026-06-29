import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { HeaderAuth } from "./header-auth";

// next/navigation is unavailable under jsdom — mock the router used by logout.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockPush.mockClear();
});

describe("HeaderAuth", () => {
  it("shows sign-in/register links for guests and no account trigger", () => {
    renderWithProviders(<HeaderAuth />, {
      auth: { isAuthenticated: false, isInitializing: false },
    });

    expect(
      screen.getByRole("link", { name: dict.header.signIn }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.header.accountTriggerAria }),
    ).not.toBeInTheDocument();
  });

  it("renders a skeleton while the session is initializing", () => {
    renderWithProviders(<HeaderAuth />, {
      auth: { isInitializing: true },
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.header.accountTriggerAria }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.header.signIn }),
    ).not.toBeInTheDocument();
  });

  it("renders the account trigger and no standalone logout button when authenticated", () => {
    renderWithProviders(<HeaderAuth />, {
      auth: { isAuthenticated: true, isInitializing: false, userId: "user-1" },
    });

    expect(
      screen.getByRole("button", { name: dict.header.accountTriggerAria }),
    ).toBeInTheDocument();
    // Logout lives inside the (closed) dropdown, not as a standalone button.
    expect(
      screen.queryByRole("button", { name: dict.auth.logout.signOut }),
    ).not.toBeInTheDocument();
  });

  it("exposes account and orders links inside the open dropdown", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HeaderAuth />, {
      auth: { isAuthenticated: true, isInitializing: false, userId: "user-1" },
    });

    await user.click(
      screen.getByRole("button", { name: dict.header.accountTriggerAria }),
    );

    expect(
      screen.getByRole("menuitem", { name: dict.header.myAccount }),
    ).toHaveAttribute("href", "/account");
    expect(
      screen.getByRole("menuitem", { name: dict.account.ordersLink }),
    ).toHaveAttribute("href", "/orders");
  });

  it("logs out via the auth mutation and clears local tokens", async () => {
    const user = userEvent.setup();
    const clearTokens = jest.fn();
    const logoutSpy = jest.fn();
    server.use(
      http.post("*/api/auth/logout", () => {
        logoutSpy();
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<HeaderAuth />, {
      auth: {
        isAuthenticated: true,
        isInitializing: false,
        userId: "user-1",
        clearTokens,
      },
    });

    await user.click(
      screen.getByRole("button", { name: dict.header.accountTriggerAria }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: dict.auth.logout.signOut }),
    );

    await waitFor(() => expect(logoutSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clearTokens).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
