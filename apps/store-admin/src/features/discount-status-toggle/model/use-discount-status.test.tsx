import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { DiscountEntity } from "@/entities/discount";
import { useDiscountStatus } from "./use-discount-status";

const d = dict.discounts;

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const DISCOUNT: DiscountEntity = {
  id: "d-1",
  code: "SUMMER500",
  type: "FIXED",
  value: "500.00",
  minSpend: "3000.00",
  maxRedemptions: null,
  perUserLimit: null,
  redeemedCount: 12,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  showOnPromoPage: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function Harness({ discount }: { discount: DiscountEntity }) {
  const { requestDeactivate, activate, isPending, confirmDialog } =
    useDiscountStatus();
  return (
    <>
      <button type="button" onClick={() => requestDeactivate(discount)}>
        off
      </button>
      <button type="button" onClick={() => activate(discount)}>
        on
      </button>
      <span>{isPending ? "pending" : "idle"}</span>
      {confirmDialog}
    </>
  );
}

function stubWrites() {
  const calls: { method: string; body?: unknown }[] = [];
  server.use(
    http.delete("*/api/admin/discounts/d-1", () => {
      calls.push({ method: "DELETE" });
      return HttpResponse.json({ data: { id: "d-1", isActive: false } });
    }),
    http.patch("*/api/admin/discounts/d-1", async ({ request }) => {
      calls.push({ method: "PATCH", body: await request.json() });
      return HttpResponse.json({ data: { ...DISCOUNT, isActive: true } });
    }),
  );
  return calls;
}

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("useDiscountStatus — «Вимкнути…» (DiscountsProposal ПК6)", () => {
  it("asks first, naming the code and the consequences — the old button switched off without a word", async () => {
    const calls = stubWrites();
    renderWithProviders(<Harness discount={DISCOUNT} />);

    await userEvent.click(screen.getByRole("button", { name: "off" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(d.disableTitle("SUMMER500"));
    expect(dialog).toHaveTextContent(d.disableDescription);
    expect(calls).toHaveLength(0);
  });

  it("sends nothing when the operator cancels", async () => {
    const calls = stubWrites();
    renderWithProviders(<Harness discount={DISCOUNT} />);

    await userEvent.click(screen.getByRole("button", { name: "off" }));
    await userEvent.click(
      await screen.findByRole("button", { name: dict.common.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(calls).toHaveLength(0);
  });

  it("soft-deactivates through the same DELETE endpoint once confirmed", async () => {
    const calls = stubWrites();
    renderWithProviders(<Harness discount={DISCOUNT} />);

    await userEvent.click(screen.getByRole("button", { name: "off" }));
    await userEvent.click(
      await screen.findByRole("button", { name: d.disableConfirm }),
    );

    await waitFor(() => expect(calls).toEqual([{ method: "DELETE" }]));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.toastDeactivated),
    );
  });

  it("says so when the server refuses", async () => {
    server.use(
      http.delete("*/api/admin/discounts/d-1", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    renderWithProviders(<Harness discount={DISCOUNT} />);

    await userEvent.click(screen.getByRole("button", { name: "off" }));
    await userEvent.click(
      await screen.findByRole("button", { name: d.disableConfirm }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.toastDeactivateFailed),
    );
  });
});

describe("useDiscountStatus — «Увімкнути»", () => {
  it("switches back on in one step, through PATCH isActive — no prompt for the safe direction", async () => {
    const calls = stubWrites();
    renderWithProviders(
      <Harness discount={{ ...DISCOUNT, isActive: false }} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "on" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toEqual([{ method: "PATCH", body: { isActive: true } }]),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(d.toastActivated),
    );
  });
});
