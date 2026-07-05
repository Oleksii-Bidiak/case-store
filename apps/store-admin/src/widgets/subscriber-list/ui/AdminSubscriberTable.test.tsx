import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminSubscriberTable } from "./AdminSubscriberTable";

const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/subscribers",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeSubscriberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    email: "buyer@example.com",
    status: "SUBSCRIBED",
    source: "home",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    unsubscribedAt: null,
    ...overrides,
  };
}

function stubList(rows = [makeSubscriberRow()]) {
  server.use(
    http.get("*/api/newsletter/admin", () =>
      HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
  );
}

describe("AdminSubscriberTable", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("renders subscriber rows (email, status badge, source)", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText("buyer@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(dict.subscribers.statusSubscribed),
    ).toBeInTheDocument();
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it("shows the empty state when there are no subscribers", async () => {
    stubList([]);
    renderWithProviders(<AdminSubscriberTable />);

    expect(await screen.findByText(dict.subscribers.empty)).toBeInTheDocument();
  });

  it("pushes the status filter into the URL", async () => {
    stubList();
    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("combobox", { name: dict.subscribers.filterStatusAria }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: dict.subscribers.statusUnsubscribed }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/subscribers?status=UNSUBSCRIBED",
    );
  });

  it("exports the filtered subscribers as a CSV download", async () => {
    stubList();
    let exportHit = false;
    server.use(
      http.get("*/api/newsletter/admin/export", () => {
        exportHit = true;
        return new HttpResponse(
          "email,status,source,createdAt\nbuyer@example.com,SUBSCRIBED,home,2026-06-01T10:00:00.000Z",
          { headers: { "Content-Type": "text/csv" } },
        );
      }),
    );

    const createObjectURL = jest.fn(() => "blob:mock-url");
    const revokeObjectURL = jest.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderWithProviders(<AdminSubscriberTable />);
    await screen.findByText("buyer@example.com");

    await userEvent.click(
      screen.getByRole("button", { name: dict.subscribers.exportCsv }),
    );

    await waitFor(() => expect(exportHit).toBe(true));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });
});
