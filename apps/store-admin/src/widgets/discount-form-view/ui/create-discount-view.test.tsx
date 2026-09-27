import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CreateDiscountView } from "./create-discount-view";

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

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(dict.discountForm.code), "dup");
  await userEvent.type(screen.getByLabelText(dict.discountForm.value), "10");
  await userEvent.click(
    screen.getByRole("button", { name: dict.discounts.createSubmit }),
  );
}

describe("CreateDiscountView — failed save (TASK-796)", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

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
    renderWithProviders(<CreateDiscountView />);

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
    renderWithProviders(<CreateDiscountView />);

    await fillAndSubmit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(dict.discounts.toastCreateFailed),
    );
  });
});
