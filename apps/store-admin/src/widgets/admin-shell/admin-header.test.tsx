import {
  renderWithProviders,
  screen,
  fireEvent,
  userEvent,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AdminHeader } from "./admin-header";

// LogoutButton (rendered inside the header) calls useRouter; the account menu
// and the help sheet read the current route.
let mockPathname = "/";
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => mockPathname,
}));

// Decouple the header from the real auth context/logout mutation — this suite
// asserts the header's contract, not sign-in state. The session is swapped per
// test: owner by default, a deputy or a manager where the role line matters.
interface MockSession {
  email: string | null;
  role: string;
  isOwner: boolean;
  isAdmin: boolean;
  permissions: string[];
}
let mockSession: MockSession;
const mockLogoutMutate = jest.fn();

jest.mock("@/entities/session", () => ({
  useAuth: () => {
    const can = (key: string) =>
      mockSession.isAdmin || mockSession.permissions.includes(key);
    return {
      userId: "admin-1",
      accessToken: null,
      isAuthenticated: true,
      isStaff: true,
      isInitializing: false,
      arePermissionsLoading: false,
      ...mockSession,
      can,
      canAll: (keys: string[]) => keys.every(can),
      setTokens: jest.fn(),
      clearTokens: jest.fn(),
    };
  },
  useAuthControllerLogout: () => ({
    mutate: mockLogoutMutate,
    isPending: false,
  }),
}));

const OWNER: MockSession = {
  email: null,
  role: "ADMIN",
  isOwner: true,
  isAdmin: true,
  permissions: [],
};

beforeEach(() => {
  mockSession = { ...OWNER };
  mockPathname = "/";
  mockLogoutMutate.mockReset();
  mockReplace.mockReset();
});

function renderHeader() {
  return renderWithProviders(
    <AdminHeader mobileNavOpen={false} onOpenMobileNav={jest.fn()} />,
  );
}

async function openAccountMenu() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: dict.header.accountMenu }),
  );
  return { user, menu: await screen.findByRole("menu") };
}

describe("AdminHeader — mobile burger", () => {
  it("renders the burger with its aria-label and aria-expanded=false when closed", () => {
    renderHeader();

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
    mockSession.email = "owner@store.ua";

    renderHeader();

    expect(screen.getByText("owner@store.ua")).toBeInTheDocument();
    expect(screen.queryByText(dict.header.adminLabel)).not.toBeInTheDocument();
  });

  it("falls back to the generic admin label when email is null", () => {
    renderHeader();

    expect(screen.getByText(dict.header.adminLabel)).toBeInTheDocument();
  });
});

describe("AdminHeader — account menu (TASK-1034)", () => {
  it("lists the email, the role line, «Мій профіль» and «Вийти»", async () => {
    mockSession.email = "owner@store.ua";
    renderHeader();

    const { menu } = await openAccountMenu();

    expect(within(menu).getByText("owner@store.ua")).toBeInTheDocument();
    expect(within(menu).getByText(dict.header.roleOwner)).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: dict.header.profile }),
    ).toHaveAttribute("href", "/profile");
    expect(
      within(menu).getByRole("menuitem", { name: dict.common.signOut }),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "a deputy admin",
      { isOwner: false, isAdmin: true },
      dict.header.roleAdmin,
    ],
    [
      "a manager",
      { isOwner: false, isAdmin: false, role: "MANAGER" },
      dict.header.roleManager,
    ],
  ])("names %s in the role line", async (_who, session, label) => {
    // An email, so the identity line is not the «Адміністратор» fallback.
    mockSession = { ...OWNER, email: "staff@store.ua", ...session };
    renderHeader();

    const { menu } = await openAccountMenu();

    expect(within(menu).getByText(label)).toBeInTheDocument();
  });

  it("keeps the standalone sign-out button in the header", () => {
    renderHeader();

    expect(
      screen.getByRole("button", { name: dict.common.signOut }),
    ).toBeInTheDocument();
  });

  it("signs out from «Вийти» in the menu", async () => {
    renderHeader();

    const { user, menu } = await openAccountMenu();
    await user.click(
      within(menu).getByRole("menuitem", { name: dict.common.signOut }),
    );

    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it("lights the trigger and «Мій профіль» on /profile", async () => {
    mockPathname = "/profile";
    renderHeader();

    expect(
      screen.getByRole("button", { name: dict.header.accountMenu }),
    ).toHaveAttribute("data-active", "true");

    const { menu } = await openAccountMenu();
    expect(
      within(menu).getByRole("menuitem", { name: dict.header.profile }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not light the trigger elsewhere", () => {
    mockPathname = "/orders";
    renderHeader();

    expect(
      screen.getByRole("button", { name: dict.header.accountMenu }),
    ).not.toHaveAttribute("data-active");
  });
});

describe("AdminHeader — section help (TASK-1034/1035)", () => {
  async function openHelp() {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: dict.header.sectionHelp }),
    );
    return screen.findByRole("dialog");
  }

  it("opens a sheet for the current section with what it does and the manager's rights", async () => {
    mockPathname = "/orders/abc";
    mockSession = {
      ...OWNER,
      isOwner: false,
      isAdmin: false,
      role: "MANAGER",
      permissions: ["orders:read", "orders:write"],
    };
    renderHeader();

    const sheet = await openHelp();

    expect(
      within(sheet).getByRole("heading", {
        name: dict.header.sectionHelpTitle(dict.nav.orders),
      }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(dict.header.sectionHelpWhat),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(/Нові замовлення — вкладка «Нові»/),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        dict.header.sectionHelpCan(
          "переглядати замовлення й змінювати статуси та ТТН",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        dict.header.sectionHelpCannot(
          "бачити платежі, повертати гроші й виправляти помилкову мітку «Кошти повернено»",
          dict.nav.staff,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("tells an owner they hold every right here", async () => {
    mockPathname = "/products";
    renderHeader();

    const sheet = await openHelp();

    expect(
      within(sheet).getByRole("heading", {
        name: dict.header.sectionHelpTitle(dict.nav.products),
      }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(dict.header.sectionHelpAllRights),
    ).toBeInTheDocument();
  });

  it("names «Пристрої» on a device-model route", async () => {
    mockPathname = "/devices/models/new";
    renderHeader();

    const sheet = await openHelp();

    expect(
      within(sheet).getByRole("heading", {
        name: dict.header.sectionHelpTitle(dict.nav.devices),
      }),
    ).toBeInTheDocument();
  });

  it("says a manager with no right here may only read the description", async () => {
    mockPathname = "/brands";
    mockSession = {
      ...OWNER,
      isOwner: false,
      isAdmin: false,
      role: "MANAGER",
      permissions: [],
    };
    renderHeader();

    const sheet = await openHelp();

    expect(within(sheet).queryByText(/^Ви можете/)).not.toBeInTheDocument();
    expect(
      within(sheet).getByText(
        dict.header.sectionHelpCannot(
          "створювати й змінювати бренди",
          dict.nav.staff,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("is reachable from the account menu too (mobile has no room for the book)", async () => {
    mockPathname = "/orders";
    renderHeader();

    const { user, menu } = await openAccountMenu();
    await user.click(
      within(menu).getByRole("menuitem", { name: dict.header.sectionHelp }),
    );

    expect(
      await screen.findByRole("heading", {
        name: dict.header.sectionHelpTitle(dict.nav.orders),
      }),
    ).toBeInTheDocument();
  });
});
