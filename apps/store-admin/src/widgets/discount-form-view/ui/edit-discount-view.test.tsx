import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { EditDiscountView } from "./edit-discount-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const DISCOUNT_ID = "5b0c1f3e-2a4d-4c6b-9e8f-0a1b2c3d4e5f";

function makeDiscount(overrides: Record<string, unknown> = {}) {
  return {
    id: DISCOUNT_ID,
    code: "AUTUMN",
    type: "PERCENT",
    value: "10",
    minSpend: null,
    maxRedemptions: null,
    perUserLimit: null,
    redeemedCount: 0,
    // Saved by the fixed form for «1 вересня – 25 жовтня»: 00:00 Kyiv on the
    // 1st is still 31 August in UTC, and the end of 25 October (a DST day) is
    // 21:59:59.999 UTC.
    startsAt: "2026-08-31T21:00:00.000Z",
    expiresAt: "2026-10-25T21:59:59.999Z",
    isActive: true,
    showOnPromoPage: false,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  };
}

function stubDiscount(discount = makeDiscount()) {
  const patchCalls: Record<string, unknown>[] = [];
  server.use(
    http.get(`*/api/admin/discounts/${DISCOUNT_ID}`, () =>
      HttpResponse.json({ data: discount }),
    ),
    http.patch(`*/api/admin/discounts/${DISCOUNT_ID}`, async ({ request }) => {
      patchCalls.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ data: discount });
    }),
  );
  return patchCalls;
}

const startsInput = () =>
  screen.getByLabelText(dict.discountForm.startsAt, { exact: false });
const expiresInput = () =>
  screen.getByLabelText(dict.discountForm.expiresAt, { exact: false });

describe("EditDiscountView — dates are Kyiv calendar days (TASK-795)", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("seeds the date inputs with the Kyiv day, not the UTC one", async () => {
    stubDiscount();
    renderWithProviders(<EditDiscountView discountId={DISCOUNT_ID} />);

    // `iso.slice(0, 10)` showed 2026-08-31 here.
    await waitFor(() => expect(startsInput()).toHaveValue("2026-09-01"));
    expect(expiresInput()).toHaveValue("2026-10-25");
  });

  it("re-saves an untouched window without moving either end", async () => {
    const patchCalls = stubDiscount();
    renderWithProviders(<EditDiscountView discountId={DISCOUNT_ID} />);
    await waitFor(() => expect(startsInput()).toHaveValue("2026-09-01"));

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.saveChanges }),
    );

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toMatchObject({
      startsAt: "2026-08-31T21:00:00.000Z",
      expiresAt: "2026-10-25T21:59:59.999Z",
    });
  });
});
