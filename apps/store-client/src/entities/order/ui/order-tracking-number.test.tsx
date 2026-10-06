import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { novaPoshtaTrackingUrl } from "../lib/tracking";
import { OrderTrackingNumber } from "./order-tracking-number";

const t = dict.order.tracking;
const TTN = "20450123456789";

describe("OrderTrackingNumber (TASK-217)", () => {
  it("copies the number and says so on the button and in a live region", async () => {
    const user = userEvent.setup();
    // userEvent installs its own clipboard stub; its readText trips over
    // jsdom's Blob, so the write itself is what is asserted.
    const write = jest.spyOn(navigator.clipboard, "writeText");
    renderWithProviders(<OrderTrackingNumber trackingNumber={TTN} />);

    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: t.copyAria(TTN) }));

    expect(write).toHaveBeenCalledWith(TTN);
    expect(screen.getByRole("button", { name: t.copied })).toBeInTheDocument();
    expect(status).toHaveTextContent(t.copiedLive(TTN));
  });

  it("claims nothing when the clipboard refuses", async () => {
    const user = userEvent.setup();
    jest
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("denied"));
    renderWithProviders(<OrderTrackingNumber trackingNumber={TTN} />);

    await user.click(screen.getByRole("button", { name: t.copyAria(TTN) }));

    expect(screen.queryByText(t.copied)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("opens Nova Poshta tracking in a new tab, named as such", () => {
    renderWithProviders(<OrderTrackingNumber trackingNumber={TTN} />);

    const link = screen.getByRole("link", { name: t.trackAria });
    expect(link).toHaveAttribute(
      "href",
      `https://novaposhta.ua/tracking/?cargo_number=${TTN}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent(t.track);
  });

  it("encodes an operator-typed number into the tracking URL", () => {
    expect(novaPoshtaTrackingUrl(" 2045 0123&x ")).toBe(
      "https://novaposhta.ua/tracking/?cargo_number=2045%200123%26x",
    );
  });
});
