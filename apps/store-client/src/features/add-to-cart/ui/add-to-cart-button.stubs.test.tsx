import { toast } from "sonner";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AddToCartButton } from "./add-to-cart-button";

// FEATURE_STUBS is read once at import time — switch it on for this file only.
jest.mock("@/shared/config", () => ({
  ...jest.requireActual("@/shared/config"),
  FEATURE_STUBS: true,
}));

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

describe("AddToCartButton — «Повідомити» behind FEATURE_STUBS (TASK-1066)", () => {
  it("offers an outline «Повідомити» on a sold-out card that announces the stub", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddToCartButton productId="p1" compact outOfStock />);

    const button = screen.getByRole("button", {
      name: dict.deviceFit.notify.short,
    });
    expect(button).toBeEnabled();
    expect(button).toHaveClass("bg-card");
    await user.click(button);
    expect(toast).toHaveBeenCalledWith(dict.deviceFit.notify.stub);
  });

  it("says «Повідомити про надходження» on the PDP", () => {
    renderWithProviders(<AddToCartButton productId="p1" outOfStock />);
    expect(
      screen.getByRole("button", { name: dict.deviceFit.notify.long }),
    ).toBeEnabled();
  });
});
