import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminUserTable } from "./AdminUserTable";

const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/users",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeUserRow() {
  return {
    id: "user-1",
    email: "buyer@example.com",
    firstName: "Ivan",
    lastName: "Petrenko",
    role: "CUSTOMER",
    isActive: true,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function stubUsers() {
  server.use(
    http.get("*/api/users", () =>
      HttpResponse.json({
        data: [makeUserRow()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
  );
}

describe("AdminUserTable — column sorting (TASK-147)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("renders sortable Email and Joined headers", async () => {
    stubUsers();
    renderWithProviders(<AdminUserTable />);
    await screen.findByText("buyer@example.com");

    expect(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.users.colEmail),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.users.colJoined),
      }),
    ).toBeInTheDocument();
  });

  it("updates the URL with sortBy=email on the Email header click", async () => {
    stubUsers();
    renderWithProviders(<AdminUserTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.users.colEmail),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=email"),
    );
  });
});

describe("AdminUserTable — status filter (TASK-150 B5)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  const openStatusFilter = async () =>
    userEvent.click(
      screen.getByRole("combobox", { name: dict.users.filterStatusAria }),
    );

  it("writes isActive=true to the URL when Active is selected", async () => {
    stubUsers();
    renderWithProviders(<AdminUserTable />);
    await screen.findByText("buyer@example.com");

    await openStatusFilter();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.common.active }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("isActive=true"),
    );
  });

  it("writes isActive=false to the URL when Inactive is selected", async () => {
    stubUsers();
    renderWithProviders(<AdminUserTable />);
    await screen.findByText("buyer@example.com");

    await openStatusFilter();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.common.inactive }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("isActive=false"),
    );
  });

  it("clears isActive from the URL when All statuses is selected", async () => {
    // Start from a filtered view so picking "All statuses" is a real change.
    mockSearchParamsRef.current = new URLSearchParams("isActive=false");
    stubUsers();
    renderWithProviders(<AdminUserTable />);
    await screen.findByText("buyer@example.com");

    await openStatusFilter();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.users.allStatuses }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.not.stringContaining("isActive"),
    );
  });
});
