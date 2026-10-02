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
  it("shows the account slide-out trigger for guests (not the dropdown trigger)", () => {
    renderWithProviders(<HeaderAuth />, {
      auth: { isAuthenticated: false, isInitializing: false },
    });

    // Guests get a "Кабінет" button that opens the auth slide-out (closed here,
    // so its login/register forms are not mounted).
    expect(
      screen.getByRole("button", { name: dict.header.accountOpenAria }),
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

  it("gives the signed-in trigger the same 44×44 / xl-caption box as the guest button", () => {
    // TASK-511/512 re-check: the signed-in trigger was AccountDropdown's own
    // 36px (h-9 w-9) icon, under the 44×44 floor and without the «Кабінет»
    // caption the guest button shows from `xl`. Both states now share a box.
    const { unmount } = renderWithProviders(<HeaderAuth />, {
      auth: { isAuthenticated: false, isInitializing: false },
    });
    const guest = screen.getByRole("button", {
      name: dict.header.accountOpenAria,
    });
    const guestClasses = guest.className.split(/\s+/).sort();
    unmount();

    renderWithProviders(<HeaderAuth />, {
      auth: { isAuthenticated: true, isInitializing: false, userId: "user-1" },
    });
    const trigger = screen.getByRole("button", {
      name: dict.header.accountTriggerAria,
    });

    expect(trigger).toHaveClass("min-h-11", "min-w-11");
    expect(trigger).not.toHaveClass("h-9", "w-9");
    expect(trigger.className.split(/\s+/).sort()).toEqual(guestClasses);
    // Caption: in the DOM, display:none below `xl` (the aria-label names it).
    const caption = screen.getByText(dict.header.accountLabel);
    expect(trigger).toContainElement(caption);
    expect(caption).toHaveClass("hidden", "xl:inline");
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
