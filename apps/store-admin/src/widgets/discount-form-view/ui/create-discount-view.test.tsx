import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { CreateDiscountView } from "./create-discount-view";

const f = dict.discountForm;
const d = dict.discounts;

let mockSearchParams = new URLSearchParams("");
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const WRITER = { permissions: [PERM.discountsWrite] };

async function fillAndSubmit() {
  await userEvent.type(screen.getByRole("textbox", { name: f.code }), "dup");
  await userEvent.type(screen.getByRole("spinbutton", { name: f.value }), "10");
  await userEvent.click(screen.getByRole("button", { name: d.createSubmit }));
}

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
  mockPush.mockReset();
  mockSearchParams = new URLSearchParams("");
});

describe("CreateDiscountView — failed save (TASK-796)", () => {
  it("shows the API's own message instead of the generic one", async () => {
    server.use(
      http.post("*/api/admin/discounts", () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: "Conflict",
            message: "Discount code DUP already exists",
          },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<CreateDiscountView />, { auth: WRITER });

    await fillAndSubmit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Discount code DUP already exists",
      ),
    );
  });

  it("falls back to the generic copy when the body says nothing", async () => {
    server.use(
      http.post("*/api/admin/discounts", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    renderWithProviders(<CreateDiscountView />, { auth: WRITER });

    await fillAndSubmit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.toastCreateFailed),
    );
  });
});

describe("CreateDiscountView — «Дублювати» (?from=)", () => {
  it("opens a new draft with the source's terms and an empty code", async () => {
    mockSearchParams = new URLSearchParams("from=src-1");
    const posts: Record<string, unknown>[] = [];
    server.use(
      http.get("*/api/admin/discounts/src-1", () =>
        HttpResponse.json({
          data: {
            id: "src-1",
            code: "SUMMER500",
            type: "FIXED",
            value: "500.00",
            minSpend: "3000.00",
            maxRedemptions: null,
            perUserLimit: 1,
            redeemedCount: 12,
            startsAt: null,
            expiresAt: null,
            isActive: true,
            showOnPromoPage: true,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        }),
      ),
      http.post("*/api/admin/discounts", async ({ request }) => {
        posts.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ data: { id: "new-1" } });
      }),
    );
    renderWithProviders(<CreateDiscountView />, { auth: WRITER });

    expect(
      await screen.findByText(d.duplicateNotice("SUMMER500")),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: f.code })).toHaveValue("");
    expect(screen.getByRole("spinbutton", { name: f.value })).toHaveValue(500);
    expect(screen.getByRole("spinbutton", { name: f.minSpend })).toHaveValue(
      3000,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: f.code }),
      "summer600",
    );
    await userEvent.click(screen.getByRole("button", { name: d.createSubmit }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      code: "SUMMER600",
      type: "FIXED",
      value: 500,
      minSpend: 3000,
      perUserLimit: 1,
      showOnPromoPage: true,
    });
  });
});
